import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { toast } from 'sonner';

import type { IssueDeploymentTokenResult } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  buildManifestInputPayload,
  createDeploymentInputDraft,
  createDeploymentSecretDraft,
  getManifestFieldGroups,
  type DeliveryManifest,
  type DeliveryManifestField,
} from '@/lib/app-delivery';
import { cn, formatTime, getInitials } from '@/lib/utils';

export interface DeployableAppOption {
  appCode: string;
  appName: string;
  appType: string;
  featureCount: number;
  manifest: DeliveryManifest | null;
  defaultInstallPath: string;
  entitlements: Array<{
    id: string;
    planCode: string;
    planName: string;
    expiresAt: string | null;
    activeDeploymentCount: number;
    maxActiveDeployments: number;
    domainBindingMode: 'none' | 'lock_on_first_success';
    domainBindingSource: 'none' | 'primaryDomain' | 'adminDomain' | 'wsDomain';
    domainBindingScope: 'registrable_domain' | 'exact_host';
    boundDomain: string | null;
  }>;
}

export interface CreateDeploymentPayload {
  appCode: string;
  entitlementId: string;
  label: string;
  environment: string;
  serverHost?: string;
  primaryDomain?: string;
  adminDomain?: string;
  wsDomain?: string;
  installPath?: string;
  updatePolicy?: 'manual' | 'auto';
  values?: Record<string, string | boolean>;
  secrets?: Record<string, string>;
}

export interface DeploymentWizardProps {
  options: DeployableAppOption[];
  initialAppCode?: string;
  onCreateDeployment: (payload: CreateDeploymentPayload) => Promise<{ id: string }>;
  onIssueToken: (params: {
    deploymentId: string;
    expiresInHours: number;
  }) => Promise<IssueDeploymentTokenResult>;
  creating: boolean;
  issuing: boolean;
}

type WizardStep = 1 | 2 | 3;

type DeploymentDraft = {
  values: Record<string, string | boolean>;
  secrets: Record<string, string>;
};

function createWizardDraft(manifest: DeliveryManifest | null): DeploymentDraft {
  return {
    values: createDeploymentInputDraft(manifest).values,
    secrets: createDeploymentSecretDraft(manifest),
  };
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

export function DeploymentWizard({
  options,
  initialAppCode,
  onCreateDeployment,
  onIssueToken,
  creating,
  issuing,
}: DeploymentWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedAppCode, setSelectedAppCode] = useState('');
  const [selectedEntitlementId, setSelectedEntitlementId] = useState('');
  const [label, setLabel] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [primaryDomain, setPrimaryDomain] = useState('');
  const [serverHost, setServerHost] = useState('');
  const [adminDomain, setAdminDomain] = useState('');
  const [wsDomain, setWsDomain] = useState('');
  const [installPath, setInstallPath] = useState('/opt/fd-headless-wp-system');
  const [updatePolicy, setUpdatePolicy] = useState<'manual' | 'auto'>('manual');
  const [deploymentDraft, setDeploymentDraft] = useState<DeploymentDraft>(
    createWizardDraft(null),
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [tokenResult, setTokenResult] = useState<IssueDeploymentTokenResult | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedApp = useMemo(
    () => options.find((option) => option.appCode === selectedAppCode) ?? null,
    [options, selectedAppCode],
  );
  const selectedEntitlement = useMemo(
    () =>
      selectedApp?.entitlements.find((entitlement) => entitlement.id === selectedEntitlementId) ??
      null,
    [selectedApp, selectedEntitlementId],
  );
  const manifest = selectedApp?.manifest ?? null;
  const userInputGroups = useMemo(
    () => getManifestFieldGroups(manifest, 'user_input'),
    [manifest],
  );
  const visibleUserInputGroups = useMemo(
    () =>
      userInputGroups
        .map((group) => ({
          ...group,
          fields: group.fields.filter((field) => !field.advanced),
        }))
        .filter((group) => group.fields.length > 0),
    [userInputGroups],
  );
  const advancedUserInputGroups = useMemo(
    () =>
      userInputGroups
        .map((group) => ({
          ...group,
          fields: group.fields.filter((field) => field.advanced),
        }))
        .filter((group) => group.fields.length > 0),
    [userInputGroups],
  );

  useEffect(() => {
    if (selectedApp && !label) {
      setLabel(`${selectedApp.appName} Production`);
    }
  }, [selectedApp, label]);

  useEffect(() => {
    if (!initialAppCode) {
      return;
    }

    if (!options.some((option) => option.appCode === initialAppCode)) {
      return;
    }

    setSelectedAppCode((current) => current || initialAppCode);
    setStep((current) => (current === 1 ? 2 : current));
  }, [initialAppCode, options]);

  useEffect(() => {
    setInstallPath(selectedApp?.defaultInstallPath ?? '/opt/fd-headless-wp-system');
    setSelectedEntitlementId(
      selectedApp?.entitlements.length === 1 ? selectedApp.entitlements[0].id : '',
    );
    setPrimaryDomain('');
    setAdminDomain('');
    setWsDomain('');
    setDeploymentDraft(createWizardDraft(selectedApp?.manifest ?? null));
    setUpdatePolicy('manual');
    setAdvancedOpen(false);
  }, [selectedAppCode, selectedApp]);

  const handleSelectApp = useCallback((appCode: string) => {
    setSelectedAppCode(appCode);
    setSelectedEntitlementId('');
    setLabel('');
  }, []);

  const setDraftValue = useCallback((key: string, value: string | boolean) => {
    setDeploymentDraft((prev) => ({
      ...prev,
      values: {
        ...prev.values,
        [key]: value,
      },
    }));
  }, []);

  const setDraftSecret = useCallback((key: string, value: string) => {
    setDeploymentDraft((prev) => ({
      ...prev,
      secrets: {
        ...prev.secrets,
        [key]: value,
      },
    }));
  }, []);

  const validateManifestInputs = useCallback(() => {
    if (!manifest) {
      toast.error('当前应用尚未同步交付 Manifest，暂时不能创建部署记录。');
      return false;
    }

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
          if (!(deploymentDraft.secrets[field.key] ?? '').trim()) {
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

    return true;
  }, [adminDomain, deploymentDraft, manifest, primaryDomain, userInputGroups, wsDomain]);

  const handleCreate = useCallback(async () => {
    if (!selectedAppCode || !selectedEntitlementId || !label.trim()) {
      return;
    }

    if (!validateManifestInputs()) {
      return;
    }

    const manifestPayload = buildManifestInputPayload(deploymentDraft);
    const payload: CreateDeploymentPayload = {
      appCode: selectedAppCode,
      entitlementId: selectedEntitlementId,
      label,
      environment,
      serverHost: serverHost || undefined,
      installPath: installPath || undefined,
      updatePolicy,
      values: Object.keys(manifestPayload.values).length > 0 ? manifestPayload.values : undefined,
      secrets:
        Object.keys(manifestPayload.secrets).length > 0 ? manifestPayload.secrets : undefined,
    };

    if (primaryDomain.trim()) {
      payload.primaryDomain = primaryDomain.trim();
    }
    if (adminDomain.trim()) {
      payload.adminDomain = adminDomain.trim();
    }
    if (wsDomain.trim()) {
      payload.wsDomain = wsDomain.trim();
    }

    try {
      const result = await onCreateDeployment(payload);
      try {
        const token = await onIssueToken({ deploymentId: result.id, expiresInHours: 2 });
        setTokenResult(token);
      } catch {
        /* token issue failed but deployment succeeded */
      }
      setStep(3);
    } catch {
      /* error handled by parent via toast */
    }
  }, [
    adminDomain,
    deploymentDraft,
    environment,
    installPath,
    label,
    onCreateDeployment,
    onIssueToken,
    primaryDomain,
    selectedAppCode,
    selectedEntitlementId,
    serverHost,
    updatePolicy,
    validateManifestInputs,
    wsDomain,
  ]);

  const handleReset = useCallback(() => {
    setStep(1);
    setSelectedAppCode('');
    setSelectedEntitlementId('');
    setLabel('');
    setEnvironment('production');
    setPrimaryDomain('');
    setServerHost('');
    setAdminDomain('');
    setWsDomain('');
    setInstallPath('/opt/fd-headless-wp-system');
    setUpdatePolicy('manual');
    setDeploymentDraft(createWizardDraft(null));
    setAdvancedOpen(false);
    setTokenResult(null);
    setCopied(false);
  }, []);

  const handleCopyCommand = useCallback((text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success('已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const stepLabels = ['选择应用', '填写部署信息', '安装命令'];
  const hasAdvancedSection = advancedUserInputGroups.length > 0 || Boolean(serverHost || installPath);

  return (
    <Card className="border-gray-200/80 bg-white/95">
      <CardHeader>
        <CardTitle>创建部署记录</CardTitle>
        <CardDescription>通过三步向导完成部署配置：选择应用、填写信息、获取安装命令。</CardDescription>
        <div className="flex items-center gap-2 pt-2">
          {stepLabels.map((sLabel, idx) => {
            const stepNum = (idx + 1) as WizardStep;
            const isActive = step === stepNum;
            const isDone = step > stepNum;
            return (
              <div key={sLabel} className="flex items-center gap-2">
                {idx > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <div
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-colors',
                    isActive && 'bg-primary text-primary-foreground',
                    isDone && 'bg-green-50 text-green-700',
                    !isActive && !isDone && 'bg-muted text-muted-foreground',
                  )}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-semibold">
                    {isDone ? <Check className="h-3 w-3" /> : stepNum}
                  </span>
                  {sLabel}
                </div>
              </div>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {step === 1 && (
          <>
            <p className="text-sm text-muted-foreground">选择一个已购的系统应用来创建部署记录。</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {options.map((app) => {
                const isSelected = selectedAppCode === app.appCode;
                return (
                  <button
                    key={app.appCode}
                    type="button"
                    onClick={() => handleSelectApp(app.appCode)}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-all hover:shadow-sm',
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border bg-white hover:border-slate-300',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {getInitials(app.appName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{app.appName}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {app.appType}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{app.featureCount} 项能力</span>
                        <span className="text-xs text-muted-foreground">
                          {app.entitlements.length} 个可用授权
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {app.manifest ? 'Manifest 已同步' : 'Manifest 未同步'}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end pt-2">
              <Button disabled={!selectedAppCode} onClick={() => setStep(2)}>
                下一步
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {!manifest ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-900">当前应用还没有同步交付 Manifest</p>
                <p className="mt-1 text-sm text-amber-800">
                  请先在后台应用编辑页同步 `fd-delivery.manifest.json`，然后再创建部署记录。
                </p>
              </div>
            ) : null}

            {selectedApp ? (
              <div className="space-y-3 rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-bold">选择部署授权 *</p>
                  <p className="text-sm text-muted-foreground">
                    一个授权实例独立计算部署上限和域名绑定；需要部署多个客户站点时，应购买多个授权。
                  </p>
                </div>
                <Select value={selectedEntitlementId} onValueChange={setSelectedEntitlementId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择一个授权实例" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedApp.entitlements.map((entitlement) => (
                      <SelectItem key={entitlement.id} value={entitlement.id}>
                        {entitlement.planName} · 已用 {entitlement.activeDeploymentCount}/
                        {entitlement.maxActiveDeployments} 个 active deployment
                        {entitlement.boundDomain ? ` · 已绑定 ${entitlement.boundDomain}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedEntitlement ? (
                  <p className="text-xs text-muted-foreground">
                    {selectedEntitlement.domainBindingMode === 'lock_on_first_success'
                      ? `首次成功部署后将锁定 ${
                          selectedEntitlement.domainBindingSource === 'primaryDomain'
                            ? '主域名'
                            : selectedEntitlement.domainBindingSource === 'adminDomain'
                              ? '后台域名'
                              : 'WS 域名'
                        }（${
                          selectedEntitlement.domainBindingScope === 'exact_host'
                            ? '完整子域名'
                            : '根域名'
                        }）。`
                      : '该授权不启用域名锁定。'}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wizard-label">部署名称 *</Label>
                <Input
                  id="wizard-label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="FutureDecade Production"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-env">环境</Label>
                <Input
                  id="wizard-env"
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
                      <Label htmlFor={`wizard-domain-${slot.key}`}>
                        {slot.label}
                        {slot.required ? ' *' : ''}
                      </Label>
                      <Input
                        id={`wizard-domain-${slot.key}`}
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        placeholder={slot.placeholder}
                      />
                      {slot.description ? (
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
                  {group.description ? (
                    <p className="text-sm text-muted-foreground">{group.description}</p>
                  ) : null}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {group.fields.map((field) => {
                    if (field.type === 'boolean') {
                      return (
                        <label
                          key={field.key}
                          className="flex items-center gap-3 rounded-md border border-border p-3"
                        >
                          <Checkbox
                            checked={getBooleanFieldValue(deploymentDraft, field)}
                            onCheckedChange={(checked) => setDraftValue(field.key, Boolean(checked))}
                          />
                          <span className="space-y-1">
                            <span className="block text-sm font-medium">{field.label}</span>
                            {field.description ? (
                              <span className="block text-xs text-muted-foreground">
                                {field.description}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    }

                    if (field.type === 'secret') {
                      return (
                        <div key={field.key} className="space-y-2">
                          <Label htmlFor={`wizard-field-${field.key}`}>
                            {field.label}
                            {field.required ? ' *' : ''}
                          </Label>
                          <Input
                            id={`wizard-field-${field.key}`}
                            type="password"
                            value={deploymentDraft.secrets[field.key] ?? ''}
                            onChange={(event) => setDraftSecret(field.key, event.target.value)}
                            placeholder={field.placeholder}
                          />
                          {field.description ? (
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                          ) : null}
                        </div>
                      );
                    }

                    return (
                      <div key={field.key} className="space-y-2">
                        <Label htmlFor={`wizard-field-${field.key}`}>
                          {field.label}
                          {field.required ? ' *' : ''}
                        </Label>
                        <Input
                          id={`wizard-field-${field.key}`}
                          type={field.type === 'email' ? 'email' : 'text'}
                          value={getTextFieldValue(deploymentDraft, field)}
                          onChange={(event) => setDraftValue(field.key, event.target.value)}
                          placeholder={field.placeholder}
                        />
                        {field.description ? (
                          <p className="text-xs text-muted-foreground">{field.description}</p>
                        ) : null}
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
                onClick={() => setAdvancedOpen(!advancedOpen)}
              >
                高级选项
                <ChevronDown className={cn('h-4 w-4 transition-transform', advancedOpen && 'rotate-180')} />
              </button>
              {advancedOpen && (
                <div className="space-y-4 border-t border-border px-4 pb-4 pt-3">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="wizard-server">服务器 / Host</Label>
                      <Input
                        id="wizard-server"
                        value={serverHost}
                        onChange={(event) => setServerHost(event.target.value)}
                        placeholder="144.48.8.218"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="wizard-install-path">安装路径</Label>
                      <Input
                        id="wizard-install-path"
                        value={installPath}
                        onChange={(event) => setInstallPath(event.target.value)}
                        placeholder={selectedApp?.defaultInstallPath ?? '/opt/fd-headless-wp-system'}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="wizard-update-policy">运行时镜像更新策略</Label>
                      <Select
                        value={updatePolicy}
                        onValueChange={(value) => setUpdatePolicy(value as 'manual' | 'auto')}
                      >
                        <SelectTrigger id="wizard-update-policy">
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
                        {group.description ? (
                          <p className="text-sm text-muted-foreground">{group.description}</p>
                        ) : null}
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        {group.fields.map((field) => {
                          if (field.type === 'boolean') {
                            return (
                              <label
                                key={field.key}
                                className="flex items-center gap-3 rounded-md border border-border p-3"
                              >
                                <Checkbox
                                  checked={getBooleanFieldValue(deploymentDraft, field)}
                                  onCheckedChange={(checked) =>
                                    setDraftValue(field.key, Boolean(checked))
                                  }
                                />
                                <span className="space-y-1">
                                  <span className="block text-sm font-medium">{field.label}</span>
                                  {field.description ? (
                                    <span className="block text-xs text-muted-foreground">
                                      {field.description}
                                    </span>
                                  ) : null}
                                </span>
                              </label>
                            );
                          }

                          if (field.type === 'secret') {
                            return (
                              <div key={field.key} className="space-y-2">
                                <Label htmlFor={`wizard-advanced-${field.key}`}>
                                  {field.label}
                                  {field.required ? ' *' : ''}
                                </Label>
                                <Input
                                  id={`wizard-advanced-${field.key}`}
                                  type="password"
                                  value={deploymentDraft.secrets[field.key] ?? ''}
                                  onChange={(event) => setDraftSecret(field.key, event.target.value)}
                                  placeholder={field.placeholder}
                                />
                                {field.description ? (
                                  <p className="text-xs text-muted-foreground">{field.description}</p>
                                ) : null}
                              </div>
                            );
                          }

                          return (
                            <div key={field.key} className="space-y-2">
                              <Label htmlFor={`wizard-advanced-${field.key}`}>
                                {field.label}
                                {field.required ? ' *' : ''}
                              </Label>
                              <Input
                                id={`wizard-advanced-${field.key}`}
                                type={field.type === 'email' ? 'email' : 'text'}
                                value={getTextFieldValue(deploymentDraft, field)}
                                onChange={(event) => setDraftValue(field.key, event.target.value)}
                                placeholder={field.placeholder}
                              />
                              {field.description ? (
                                <p className="text-xs text-muted-foreground">{field.description}</p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {!hasAdvancedSection ? (
                    <p className="text-sm text-muted-foreground">当前没有额外的高级配置项。</p>
                  ) : null}
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                上一步
              </Button>
              <Button
                disabled={
                  !selectedAppCode ||
                  !selectedEntitlementId ||
                  !label.trim() ||
                  !manifest ||
                  creating ||
                  issuing
                }
                onClick={handleCreate}
              >
                {creating || issuing ? '创建中...' : '创建部署'}
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-bold text-green-800">部署记录已创建成功</p>
              <p className="mt-1 text-sm text-green-700">
                部署名称：<span className="font-bold">{label}</span>
              </p>
            </div>

            {tokenResult ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    Remote Install Command
                  </p>
                  <div className="relative">
                    <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 pr-10 text-xs text-slate-100">
                      {tokenResult.remoteInstallCommand ?? '当前未生成远程安装命令'}
                    </pre>
                    {tokenResult.remoteInstallCommand ? (
                      <button
                        type="button"
                        className="absolute right-2 top-2 rounded-lg bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                        onClick={() => handleCopyCommand(tokenResult.remoteInstallCommand!)}
                      >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Token 尾号
                    </p>
                    <p className="mt-1 font-mono text-sm text-slate-900">{tokenResult.tokenHint}</p>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      过期时间
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {formatTime(tokenResult.expiresAt)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    Exchange URL
                  </p>
                  <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                    {tokenResult.exchangeUrl}
                  </pre>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    One-time Token
                  </p>
                  <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                    {tokenResult.token}
                  </pre>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    Exchange Curl
                  </p>
                  <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                    {tokenResult.exchangeCurl}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">
                  部署令牌签发未能完成，请在下方部署列表中手动签发。
                </p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={handleReset}>完成</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
