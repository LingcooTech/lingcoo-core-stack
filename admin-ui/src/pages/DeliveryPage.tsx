import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { listAppsAdmin } from '@/api/apps';
import { clearDeliverySettings, getDeliverySettings, upsertDeliverySettings } from '@/api/delivery';
import type { DeliveryFieldDefinition, DeliveryFieldGroup } from '@/api/types';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

type DraftValues = Record<string, string | boolean | null>;
type DraftSecrets = Record<string, string>;

function isStringFilled(value: string | boolean | null | undefined) {
  return typeof value === 'string' ? value.trim().length > 0 : typeof value === 'boolean';
}

function fieldNeedsAttention(field: DeliveryFieldDefinition, value: string | boolean | null | undefined) {
  return field.required && !isStringFilled(value);
}

function sortFieldsByLabel(fields: DeliveryFieldDefinition[]) {
  return [...fields].sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
}

export function DeliveryPage() {
  const qc = useQueryClient();
  const appsQuery = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const deployableApps = useMemo(
    () => (appsQuery.data?.items ?? []).filter((app) => app.type === 'service' || app.type === 'web_app'),
    [appsQuery.data?.items]
  );
  const [selectedAppCode, setSelectedAppCode] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [draftValues, setDraftValues] = useState<DraftValues>({});
  const [draftSecrets, setDraftSecrets] = useState<DraftSecrets>({});

  useEffect(() => {
    if (!selectedAppCode && deployableApps[0]?.code) {
      setSelectedAppCode(deployableApps[0].code);
    }
  }, [deployableApps, selectedAppCode]);

  const settingsQuery = useQuery({
    queryKey: ['delivery-settings', selectedAppCode],
    queryFn: () => getDeliverySettings(selectedAppCode),
    enabled: Boolean(selectedAppCode)
  });

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) {
      return;
    }

    setDraftValues(settings.values);
    setDraftSecrets(
      Object.fromEntries(settings.manifest.secretFields.map((field) => [field.key, '']))
    );
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertDeliverySettings(selectedAppCode, {
        values: draftValues,
        secrets: Object.fromEntries(
          Object.entries(draftSecrets).filter(([, value]) => value.trim().length > 0)
        )
      }),
    onSuccess: () => {
      toast.success('交付设置已保存');
      void qc.invalidateQueries({ queryKey: ['delivery-settings', selectedAppCode] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败')
  });

  const clearMutation = useMutation({
    mutationFn: () => clearDeliverySettings(selectedAppCode),
    onSuccess: () => {
      toast.success('交付设置已清空');
      void qc.invalidateQueries({ queryKey: ['delivery-settings', selectedAppCode] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '清空失败')
  });

  const settings = settingsQuery.data;
  const groups = settings?.manifest.groups ?? [];

  const visibleEnvFields = useMemo(() => {
    if (!settings) {
      return [];
    }

    return sortFieldsByLabel(
      settings.manifest.envFields.filter((field) => {
        if (field.scope === 'system') {
          return false;
        }

        if (field.scope === 'user_input') {
          return true;
        }

        return (field.editable ?? true) && (showAdvanced || fieldNeedsAttention(field, draftValues[field.key]));
      })
    );
  }, [draftValues, settings, showAdvanced]);

  const visibleSecretFields = useMemo(() => {
    if (!settings) {
      return [];
    }

    return sortFieldsByLabel(
      settings.manifest.secretFields.filter((field) => {
        if (field.scope === 'system') {
          return false;
        }

        if (field.scope === 'user_input') {
          return true;
        }

        const configured = settings.secrets[field.key]?.configured ?? false;
        return (field.editable ?? true) && (showAdvanced || (field.required && !configured));
      })
    );
  }, [settings, showAdvanced]);

  const groupMap = useMemo(() => {
    const map = new Map<string, { group: DeliveryFieldGroup; env: DeliveryFieldDefinition[]; secret: DeliveryFieldDefinition[] }>();

    const ensureGroup = (key: string) => {
      if (!map.has(key)) {
        const fallbackGroup = groups.find((group) => group.key === key) ?? { key, label: key };
        map.set(key, { group: fallbackGroup, env: [], secret: [] });
      }

      return map.get(key)!;
    };

    for (const field of visibleEnvFields) {
      ensureGroup(field.group ?? 'general').env.push(field);
    }

    for (const field of visibleSecretFields) {
      ensureGroup(field.group ?? 'general').secret.push(field);
    }

    return Array.from(map.values());
  }, [groups, visibleEnvFields, visibleSecretFields]);

  return (
    <div>
      <SectionHeader sectionKey="delivery" />
      <div className="space-y-6 p-6">
        <div className="max-w-xl space-y-3">
          <label className="block text-sm font-bold">选择交付应用</label>
          <select
            className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            value={selectedAppCode}
            onChange={(event) => setSelectedAppCode(event.target.value)}
          >
            {deployableApps.map((app) => (
              <option key={app.code} value={app.code}>
                {app.name} ({app.code})
              </option>
            ))}
          </select>
        </div>

        {settings ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4">
              <StatusPill tone={settings.configured ? 'ok' : 'warn'} label={settings.configured ? '交付配置完整' : '需要补充实例参数'} />
              <StatusPill tone="info" label={`Installer: ${settings.manifest.installer.installPath}`} />
              <StatusPill tone="neutral" label={`Repo: ${settings.manifest.installer.repoBranch}`} />
            </div>

            {settings.manifest.domainSlots.length > 0 ? (
              <div className="rounded-2xl border border-border bg-white p-5">
                <h2 className="text-sm font-black">域名槽位</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {settings.manifest.domainSlots.map((slot) => (
                    <div key={slot.key} className="rounded-xl border border-border bg-muted/40 p-4">
                      <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">{slot.label}</p>
                      <p className="mt-2 text-sm font-black text-foreground">{slot.envKey}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{slot.placeholder ?? '由部署实例填写'}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-3">
              <Checkbox
                id="delivery-advanced"
                checked={showAdvanced}
                onCheckedChange={(checked) => setShowAdvanced(Boolean(checked))}
              />
              <label htmlFor="delivery-advanced" className="text-sm font-medium">
                显示高级预设字段
              </label>
            </div>

            {groupMap.map(({ group, env, secret }) => (
              <div key={group.key} className="rounded-2xl border border-border bg-white p-5">
                <div className="mb-4">
                  <h2 className="text-sm font-black">{group.label}</h2>
                  {group.description ? <p className="mt-1 text-xs text-muted-foreground">{group.description}</p> : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {env.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <label className="block text-sm font-bold">
                        {field.label}
                        {field.required ? <span className="ml-1 text-red-500">*</span> : null}
                      </label>

                      {field.type === 'boolean' ? (
                        <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                          <Checkbox
                            checked={draftValues[field.key] === true}
                            onCheckedChange={(checked) =>
                              setDraftValues((current) => ({ ...current, [field.key]: Boolean(checked) }))
                            }
                          />
                          <span className="text-sm text-muted-foreground">
                            {field.description ?? '开关型部署预设'}
                          </span>
                        </div>
                      ) : (() => {
                        const fieldValue = draftValues[field.key];
                        return (
                          <Input
                            type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
                            value={typeof fieldValue === 'string' ? fieldValue : ''}
                            placeholder={field.placeholder ?? undefined}
                            onChange={(event) =>
                              setDraftValues((current) => ({ ...current, [field.key]: event.target.value }))
                            }
                          />
                        );
                      })()}

                      <div className="flex items-center gap-2">
                        <StatusPill
                          tone={field.scope === 'user_input' ? 'warn' : 'neutral'}
                          label={field.scope === 'user_input' ? '用户填写' : field.advanced ? '高级预设' : '预设'}
                        />
                        {field.defaultValue !== null && field.defaultValue !== undefined ? (
                          <span className="text-xs text-muted-foreground">默认值：{String(field.defaultValue)}</span>
                        ) : null}
                      </div>

                      {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
                    </div>
                  ))}

                  {secret.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <label className="block text-sm font-bold">
                        {field.label}
                        {field.required ? <span className="ml-1 text-red-500">*</span> : null}
                      </label>
                      <Input
                        type="password"
                        value={draftSecrets[field.key] ?? ''}
                        placeholder={settings.secrets[field.key]?.configured ? '已保存，留空保持不变' : field.placeholder ?? '当前未配置'}
                        onChange={(event) =>
                          setDraftSecrets((current) => ({ ...current, [field.key]: event.target.value }))
                        }
                      />
                      <div className="flex items-center gap-2">
                        <StatusPill
                          tone={settings.secrets[field.key]?.configured ? 'ok' : 'warn'}
                          label={settings.secrets[field.key]?.configured ? '已保存' : '待填写'}
                        />
                        <StatusPill
                          tone={field.scope === 'user_input' ? 'warn' : 'neutral'}
                          label={field.scope === 'user_input' ? '用户填写' : field.advanced ? '高级预设' : '预设'}
                        />
                      </div>
                      {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {settings.manifest.notes?.length ? (
              <div className="rounded-2xl border border-border bg-muted/30 p-5">
                <h2 className="text-sm font-black">交付说明</h2>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {settings.manifest.notes.map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? '保存中...' : '保存配置'}
              </Button>
              <Button
                variant="outline"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending || saveMutation.isPending}
              >
                清空覆盖值
              </Button>
            </div>
          </div>
        ) : settingsQuery.isLoading ? (
          <div className="rounded-2xl border border-border bg-white p-5 text-sm text-muted-foreground">加载交付配置中...</div>
        ) : null}
      </div>
    </div>
  );
}
