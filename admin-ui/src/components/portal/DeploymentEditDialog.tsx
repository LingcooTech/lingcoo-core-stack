import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

import type { DeploymentSummary } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  buildManifestInputPayload,
  createDeploymentInputDraft,
  createDeploymentSecretDraft,
  getManifestFieldGroups,
  type DeliveryManifest,
  type DeliveryManifestField
} from '@/lib/app-delivery';
import { cn } from '@/lib/utils';

type DeploymentDraft = {
  values: Record<string, string | boolean>;
  secrets: Record<string, string>;
};

function getDomainSourceLabel(sourceField: 'primaryDomain' | 'adminDomain' | 'wsDomain') {
  switch (sourceField) {
    case 'adminDomain':
      return '后台域名';
    case 'wsDomain':
      return 'WS 域名';
    case 'primaryDomain':
    default:
      return '主域名';
  }
}

export interface DeploymentEditAppOption {
  appCode: string;
  appName: string;
  manifest: DeliveryManifest | null;
  defaultInstallPath: string;
}

function hasOwnValue(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function getTextFieldValue(draft: DeploymentDraft, field: DeliveryManifestField) {
  if (hasOwnValue(draft.values, field.key)) {
    const current = draft.values[field.key];
    return typeof current === 'string' ? current : '';
  }

  return typeof field.defaultValue === 'string' ? field.defaultValue : '';
}

function getBooleanFieldValue(draft: DeploymentDraft, field: DeliveryManifestField) {
  if (hasOwnValue(draft.values, field.key)) {
    return Boolean(draft.values[field.key]);
  }

  return typeof field.defaultValue === 'boolean' ? field.defaultValue : false;
}

function createEditDraft(
  manifest: DeliveryManifest | null,
  deployment: DeploymentSummary | null
): DeploymentDraft {
  const base = createDeploymentInputDraft(manifest);
  return {
    values: {
      ...base.values,
      ...(deployment?.deliveryValues ?? {})
    },
    secrets: createDeploymentSecretDraft(manifest)
  };
}

export function DeploymentEditDialog({
  open,
  onOpenChange,
  deployment,
  appOption,
  saving,
  onSave
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deployment: DeploymentSummary | null;
  appOption: DeploymentEditAppOption | null;
  saving?: boolean;
  onSave: (payload: {
    deploymentId: string;
    label?: string;
    environment?: string;
    serverHost?: string;
    primaryDomain?: string;
    adminDomain?: string;
    wsDomain?: string;
    installPath?: string;
    updatePolicy?: 'manual' | 'auto';
    values?: Record<string, string | boolean>;
    secrets?: Record<string, string>;
  }) => Promise<void>;
}) {
  const manifest = appOption?.manifest ?? null;
  const [label, setLabel] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [serverHost, setServerHost] = useState('');
  const [primaryDomain, setPrimaryDomain] = useState('');
  const [adminDomain, setAdminDomain] = useState('');
  const [wsDomain, setWsDomain] = useState('');
  const [installPath, setInstallPath] = useState('/opt/fd-headless-wp-system');
  const [updatePolicy, setUpdatePolicy] = useState<'manual' | 'auto'>('manual');
  const [deploymentDraft, setDeploymentDraft] = useState<DeploymentDraft>(createEditDraft(null, null));
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const userInputGroups = useMemo(() => getManifestFieldGroups(manifest, 'user_input'), [manifest]);
  const visibleUserInputGroups = useMemo(
    () =>
      userInputGroups
        .map((group) => ({
          ...group,
          fields: group.fields.filter((field) => !field.advanced)
        }))
        .filter((group) => group.fields.length > 0),
    [userInputGroups]
  );
  const advancedUserInputGroups = useMemo(
    () =>
      userInputGroups
        .map((group) => ({
          ...group,
          fields: group.fields.filter((field) => field.advanced)
        }))
        .filter((group) => group.fields.length > 0),
    [userInputGroups]
  );
  const bindingSourceField = deployment?.domainBinding.sourceField ?? 'none';
  const boundDomain = deployment?.domainBinding.boundDomain ?? null;

  useEffect(() => {
    if (!deployment) {
      setLabel('');
      setEnvironment('production');
      setServerHost('');
      setPrimaryDomain('');
      setAdminDomain('');
      setWsDomain('');
      setInstallPath(appOption?.defaultInstallPath ?? '/opt/fd-headless-wp-system');
      setUpdatePolicy('manual');
      setDeploymentDraft(createEditDraft(manifest, null));
      setAdvancedOpen(false);
      return;
    }

    setLabel(deployment.label);
    setEnvironment(deployment.environment);
    setServerHost(deployment.serverHost ?? '');
    setPrimaryDomain(deployment.primaryDomain ?? '');
    setAdminDomain(deployment.adminDomain ?? '');
    setWsDomain(deployment.wsDomain ?? '');
    setInstallPath(deployment.installPath || appOption?.defaultInstallPath || '/opt/fd-headless-wp-system');
    setUpdatePolicy(deployment.updatePolicy ?? 'manual');
    setDeploymentDraft(createEditDraft(manifest, deployment));
    setAdvancedOpen(Boolean(deployment.serverHost));
  }, [appOption?.defaultInstallPath, deployment, manifest]);

  const setDraftValue = useCallback((key: string, value: string | boolean) => {
    setDeploymentDraft((prev) => ({
      ...prev,
      values: {
        ...prev.values,
        [key]: value
      }
    }));
  }, []);

  const setDraftSecret = useCallback((key: string, value: string) => {
    setDeploymentDraft((prev) => ({
      ...prev,
      secrets: {
        ...prev.secrets,
        [key]: value
      }
    }));
  }, []);

  const validateInputs = useCallback(() => {
    if (!deployment) {
      return false;
    }

    if (!label.trim()) {
      toast.error('部署名称不能为空');
      return false;
    }

    if (manifest) {
      for (const slot of manifest.domainSlots) {
        const value =
          slot.sourceField === 'primaryDomain'
            ? primaryDomain
            : slot.sourceField === 'adminDomain'
              ? adminDomain
              : wsDomain;
        if (slot.required && !value.trim()) {
          toast.error(`${slot.label}不能为空`);
          return false;
        }
      }

      for (const group of userInputGroups) {
        for (const field of group.fields) {
          if (!field.required) {
            continue;
          }

          if (field.type === 'secret') {
            const hasSavedSecret = deployment.configuredSecretKeys.includes(field.key);
            if (!hasSavedSecret && !(deploymentDraft.secrets[field.key] ?? '').trim()) {
              toast.error(`${field.label}不能为空`);
              return false;
            }
            continue;
          }

          if (field.type === 'boolean') {
            if (!hasOwnValue(deploymentDraft.values, field.key) && typeof field.defaultValue !== 'boolean') {
              toast.error(`${field.label}不能为空`);
              return false;
            }
            continue;
          }

          if (!getTextFieldValue(deploymentDraft, field).trim()) {
            toast.error(`${field.label}不能为空`);
            return false;
          }
        }
      }
    }

    return true;
  }, [adminDomain, deployment, deploymentDraft.secrets, deploymentDraft.values, label, manifest, primaryDomain, userInputGroups, wsDomain]);

  const handleSave = useCallback(async () => {
    if (!deployment || !validateInputs()) {
      return;
    }

    const manifestPayload = buildManifestInputPayload(deploymentDraft);
    await onSave({
      deploymentId: deployment.id,
      label: label.trim(),
      environment: environment.trim() || deployment.environment,
      serverHost: serverHost.trim() || undefined,
      primaryDomain: primaryDomain.trim() || undefined,
      adminDomain: adminDomain.trim() || undefined,
      wsDomain: wsDomain.trim() || undefined,
      installPath: installPath.trim() || undefined,
      updatePolicy,
      values: Object.keys(manifestPayload.values).length > 0 ? manifestPayload.values : undefined,
      secrets: Object.keys(manifestPayload.secrets).length > 0 ? manifestPayload.secrets : undefined
    });
  }, [
    adminDomain,
    deployment,
    deploymentDraft,
    environment,
    installPath,
    label,
    onSave,
    primaryDomain,
    serverHost,
    updatePolicy,
    validateInputs,
    wsDomain
  ]);

  const hasAdvancedSection = advancedUserInputGroups.length > 0 || Boolean(serverHost || installPath);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑 Deployment 配置</DialogTitle>
          <DialogDescription>
            修改当前部署记录的域名、服务器信息和用户输入配置。保存后可以直接重新签发 deploy token。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-deployment-label">部署名称 *</Label>
              <Input
                id="edit-deployment-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="FutureDecade Production"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-deployment-environment">环境</Label>
              <Input
                id="edit-deployment-environment"
                value={environment}
                onChange={(event) => setEnvironment(event.target.value)}
                placeholder="production"
              />
            </div>
          </div>

          {manifest?.domainSlots.length ? (
            <div className="grid gap-4 md:grid-cols-3">
              {manifest.domainSlots.map((slot) => {
                const value =
                  slot.sourceField === 'primaryDomain'
                    ? primaryDomain
                    : slot.sourceField === 'adminDomain'
                      ? adminDomain
                      : wsDomain;
                const onChange = (nextValue: string) => {
                  if (slot.sourceField === 'primaryDomain') {
                    setPrimaryDomain(nextValue);
                    return;
                  }
                  if (slot.sourceField === 'adminDomain') {
                    setAdminDomain(nextValue);
                    return;
                  }
                  setWsDomain(nextValue);
                };

                return (
                  <div key={slot.key} className="space-y-2">
                    <Label htmlFor={`edit-domain-${slot.key}`}>
                      {slot.label}
                      {slot.required ? ' *' : ''}
                    </Label>
                    <Input
                      id={`edit-domain-${slot.key}`}
                      value={value}
                      onChange={(event) => onChange(event.target.value)}
                      placeholder={slot.placeholder}
                      disabled={deployment?.domainBinding.isLocked === true && bindingSourceField === slot.sourceField}
                    />
                    {deployment?.domainBinding.isLocked === true && bindingSourceField === slot.sourceField ? (
                      <p className="text-xs text-amber-700">
                        当前{slot.label}已绑定为 {boundDomain ?? value}。如需更换，需要提交工单。
                      </p>
                    ) : bindingSourceField === slot.sourceField ? (
                      <p className="text-xs text-muted-foreground">
                        启用域名绑定后，首次成功部署会锁定这个{getDomainSourceLabel(slot.sourceField)}。
                      </p>
                    ) : slot.description ? (
                      <p className="text-xs text-muted-foreground">{slot.description}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {visibleUserInputGroups.map((group) => (
            <div key={group.key} className="space-y-4 rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-bold">{group.label}</p>
                {group.description ? <p className="text-sm text-muted-foreground">{group.description}</p> : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {group.fields.map((field) => {
                  if (field.type === 'boolean') {
                    return (
                      <label key={field.key} className="flex items-center gap-3 rounded-md border border-border p-3">
                        <Checkbox
                          checked={getBooleanFieldValue(deploymentDraft, field)}
                          onCheckedChange={(checked) => setDraftValue(field.key, Boolean(checked))}
                        />
                        <span className="space-y-1">
                          <span className="block text-sm font-medium">{field.label}</span>
                          {field.description ? (
                            <span className="block text-xs text-muted-foreground">{field.description}</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  }

                  if (field.type === 'secret') {
                    const hasSavedSecret = deployment?.configuredSecretKeys.includes(field.key) ?? false;
                    return (
                      <div key={field.key} className="space-y-2">
                        <Label htmlFor={`edit-field-${field.key}`}>
                          {field.label}
                          {field.required ? ' *' : ''}
                        </Label>
                        <Input
                          id={`edit-field-${field.key}`}
                          type="password"
                          value={deploymentDraft.secrets[field.key] ?? ''}
                          onChange={(event) => setDraftSecret(field.key, event.target.value)}
                          placeholder={hasSavedSecret ? '已保存，留空保持不变' : field.placeholder}
                        />
                        {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
                      </div>
                    );
                  }

                  return (
                    <div key={field.key} className="space-y-2">
                      <Label htmlFor={`edit-field-${field.key}`}>
                        {field.label}
                        {field.required ? ' *' : ''}
                      </Label>
                      <Input
                        id={`edit-field-${field.key}`}
                        type={field.type === 'email' ? 'email' : 'text'}
                        value={getTextFieldValue(deploymentDraft, field)}
                        onChange={(event) => setDraftValue(field.key, event.target.value)}
                        placeholder={field.placeholder}
                      />
                      {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="rounded-lg border border-border">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setAdvancedOpen((current) => !current)}
            >
              高级选项
              <ChevronDown className={cn('h-4 w-4 transition-transform', advancedOpen && 'rotate-180')} />
            </button>
            {advancedOpen ? (
              <div className="space-y-4 border-t border-border px-4 pb-4 pt-3">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-deployment-server">服务器 / Host</Label>
                    <Input
                      id="edit-deployment-server"
                      value={serverHost}
                      onChange={(event) => setServerHost(event.target.value)}
                      placeholder="144.48.8.218"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-deployment-install-path">安装路径</Label>
                    <Input
                      id="edit-deployment-install-path"
                      value={installPath}
                      onChange={(event) => setInstallPath(event.target.value)}
                      placeholder={appOption?.defaultInstallPath ?? '/opt/fd-headless-wp-system'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-update-policy">运行时镜像更新策略</Label>
                    <Select
                      value={updatePolicy}
                      onValueChange={(value) => setUpdatePolicy(value as 'manual' | 'auto')}
                    >
                      <SelectTrigger id="edit-update-policy">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">手动更新</SelectItem>
                        <SelectItem value="auto">自动更新</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      `manual` 只记录新镜像可用状态，不自动切换；`auto` 会在收到新镜像时直接应用。
                    </p>
                  </div>
                </div>

                {advancedUserInputGroups.map((group) => (
                  <div key={group.key} className="space-y-4 rounded-lg border border-border p-4">
                    <div>
                      <p className="text-sm font-bold">{group.label}</p>
                      {group.description ? <p className="text-sm text-muted-foreground">{group.description}</p> : null}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {group.fields.map((field) => {
                        if (field.type === 'boolean') {
                          return (
                            <label key={field.key} className="flex items-center gap-3 rounded-md border border-border p-3">
                              <Checkbox
                                checked={getBooleanFieldValue(deploymentDraft, field)}
                                onCheckedChange={(checked) => setDraftValue(field.key, Boolean(checked))}
                              />
                              <span className="space-y-1">
                                <span className="block text-sm font-medium">{field.label}</span>
                                {field.description ? (
                                  <span className="block text-xs text-muted-foreground">{field.description}</span>
                                ) : null}
                              </span>
                            </label>
                          );
                        }

                        if (field.type === 'secret') {
                          const hasSavedSecret = deployment?.configuredSecretKeys.includes(field.key) ?? false;
                          return (
                            <div key={field.key} className="space-y-2">
                              <Label htmlFor={`edit-advanced-${field.key}`}>
                                {field.label}
                                {field.required ? ' *' : ''}
                              </Label>
                              <Input
                                id={`edit-advanced-${field.key}`}
                                type="password"
                                value={deploymentDraft.secrets[field.key] ?? ''}
                                onChange={(event) => setDraftSecret(field.key, event.target.value)}
                                placeholder={hasSavedSecret ? '已保存，留空保持不变' : field.placeholder}
                              />
                              {field.description ? (
                                <p className="text-xs text-muted-foreground">{field.description}</p>
                              ) : null}
                            </div>
                          );
                        }

                        return (
                          <div key={field.key} className="space-y-2">
                            <Label htmlFor={`edit-advanced-${field.key}`}>
                              {field.label}
                              {field.required ? ' *' : ''}
                            </Label>
                            <Input
                              id={`edit-advanced-${field.key}`}
                              type={field.type === 'email' ? 'email' : 'text'}
                              value={getTextFieldValue(deploymentDraft, field)}
                              onChange={(event) => setDraftValue(field.key, event.target.value)}
                              placeholder={field.placeholder}
                            />
                            {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {!hasAdvancedSection ? <p className="text-sm text-muted-foreground">当前没有额外的高级配置项。</p> : null}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void handleSave()} disabled={!deployment || saving}>
            {saving ? '保存中...' : '保存配置'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
