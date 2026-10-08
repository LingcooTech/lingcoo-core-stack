import { HostingCheckout } from '@/components/hosting/HostingCheckout';
import { apiClient } from '@/api/client';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { hostedPrefixSchema, serverIpSchema, type ManagedDeployment } from '@lingcoo/contracts';
import { getDeploymentOptions } from '@/api/user';
import { ManagedDeploymentProgress } from './ManagedDeploymentProgress';
import { handleAsync } from '@/lib/async-events';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { toast } from 'sonner';

import type { IssueDeploymentTokenResult } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  managedAvailable?: boolean;
  entitlements: Array<{
    id: string;
    planCode: string;
    planName: string;
    expiresAt: string | null;
    activeDeploymentCount: number;
    maxActiveDeployments: number;
    domainBindingMode: 'none' | 'lock_on_first_success';
    domainBindingSource: string;
    domainBindingScope: 'registrable_domain' | 'exact_host';
    boundDomain: string | null;
  }>;
}

export interface CreateDeploymentPayload {
  appCode: string;
  entitlementId: string;
  label: string;
  environment: string;
  deploymentMode: 'self_hosted' | 'managed';
  hostingPurchaseId?: string;
  hostedPrefix?: string;
  serverHost?: string;
  installPath?: string;
  updatePolicy?: 'manual' | 'auto';
  domainValues?: Record<string, string>;
  values?: Record<string, string | boolean>;
  secrets?: Record<string, string>;
}

export interface DeploymentWizardProps {
  options: DeployableAppOption[];
  initialAppCode?: string;
  onCreateDeployment: (
    payload: CreateDeploymentPayload,
  ) => Promise<{ id: string; managed?: ManagedDeployment | null }>;
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
  const { user } = useAuth();
  const [hostingPurchaseId, setHostingPurchaseId] = useState('');
  const purchases = useQuery({
    queryKey: ['hosting-purchases'],
    queryFn: () =>
      apiClient('GET /v1/billing/hosting-purchases/me', '/v1/billing/hosting-purchases/me'),
  });
  const deploymentOptions = useQuery({
    queryKey: ['deployment-options'],
    queryFn: getDeploymentOptions,
  });
  const [deploymentMode, setDeploymentMode] = useState<'self_hosted' | 'managed'>('self_hosted');
  const [hostedPrefix, setHostedPrefix] = useState('');
  const [managedResult, setManagedResult] = useState<ManagedDeployment | null>(null);
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedAppCode, setSelectedAppCode] = useState('');
  const initializedAppCode = useRef<string | null>(null);
  const [selectedEntitlementId, setSelectedEntitlementId] = useState('');
  const [label, setLabel] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [serverHost, setServerHost] = useState('');
  const [domainValues, setDomainValues] = useState<Record<string, string>>({});
  const [installPath, setInstallPath] = useState('/opt/fd-headless-wp-system');
  const [updatePolicy, setUpdatePolicy] = useState<'manual' | 'auto'>('manual');
  const [deploymentDraft, setDeploymentDraft] = useState<DeploymentDraft>(createWizardDraft(null));
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
  const userInputGroups = useMemo(() => getManifestFieldGroups(manifest, 'user_input'), [manifest]);
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
    if (!selectedApp || initializedAppCode.current === selectedAppCode) return;
    initializedAppCode.current = selectedAppCode;
    setInstallPath(selectedApp?.defaultInstallPath ?? '/opt/fd-headless-wp-system');
    setSelectedEntitlementId(
      selectedApp?.entitlements.length === 1 ? (selectedApp.entitlements[0]?.id ?? '') : '',
    );
    setDeploymentMode('self_hosted');
    setHostedPrefix('');
    setHostingPurchaseId('');
    setDomainValues({});
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

    if (
      deploymentMode === 'managed' &&
      user?.role !== 'admin' &&
      !purchases.data?.items.some(
        (p) =>
          p.id === hostingPurchaseId &&
          p.appCode === selectedAppCode &&
          p.status === 'available' &&
          (!p.item.hostingTerms?.target ||
            p.item.hostingTerms.target.entitlementId === selectedEntitlementId),
      )
    ) {
      toast.error('请选择当前应用的可用托管资格');
      return false;
    }
    if (deploymentMode === 'self_hosted' && !serverIpSchema.safeParse(serverHost.trim()).success) {
      toast.error('请填写有效的服务器 IPv4 或 IPv6 地址');
      return false;
    }
    if (
      deploymentMode === 'managed' &&
      hostedPrefix &&
      !hostedPrefixSchema.safeParse(hostedPrefix).success
    ) {
      toast.error(
        '子域名前缀须为 3–48 位，以字母开头，仅含字母、数字和单个连字符，且不能使用平台保留名称',
      );
      return false;
    }
    for (const slot of deploymentMode === 'managed' ? [] : manifest.domainSlots) {
      const value = domainValues[slot.sourceField] ?? '';
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
          if (
            !hasOwnValue(deploymentDraft.values, field.key) &&
            typeof field.defaultValue !== 'boolean'
          ) {
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
  }, [
    hostingPurchaseId,
    purchases.data,
    selectedAppCode,
    selectedEntitlementId,
    user?.role,
    deploymentDraft,
    domainValues,
    manifest,
    userInputGroups,
    deploymentMode,
    hostedPrefix,
    serverHost,
  ]);

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
      deploymentMode,
      hostingPurchaseId: deploymentMode === 'managed' ? hostingPurchaseId || undefined : undefined,
      hostedPrefix: deploymentMode === 'managed' ? hostedPrefix.trim() || undefined : undefined,
      serverHost: deploymentMode === 'self_hosted' ? serverHost.trim() : undefined,
      installPath: deploymentMode === 'self_hosted' ? installPath || undefined : undefined,
      updatePolicy,
      domainValues:
        deploymentMode === 'managed'
          ? undefined
          : Object.fromEntries(
              Object.entries(domainValues)
                .map(([key, value]) => [key, value.trim()] as const)
                .filter(([, value]) => value.length > 0),
            ),
      values: Object.keys(manifestPayload.values).length > 0 ? manifestPayload.values : undefined,
      secrets:
        Object.keys(manifestPayload.secrets).length > 0 ? manifestPayload.secrets : undefined,
    };

    try {
      const result = await onCreateDeployment(payload);
      setManagedResult(result.managed ?? null);
      if (deploymentMode === 'self_hosted')
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
    hostingPurchaseId,
    deploymentMode,
    hostedPrefix,
    deploymentDraft,
    domainValues,
    environment,
    installPath,
    label,
    onCreateDeployment,
    onIssueToken,
    selectedAppCode,
    selectedEntitlementId,
    serverHost,
    updatePolicy,
    validateManifestInputs,
  ]);

  const handleReset = useCallback(() => {
    setDeploymentMode('self_hosted');
    setHostedPrefix('');
    setHostingPurchaseId('');
    setManagedResult(null);
    setStep(1);
    setSelectedAppCode('');
    setSelectedEntitlementId('');
    setLabel('');
    setEnvironment('production');
    setServerHost('');
    setDomainValues({});
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

  const stepLabels = [
    '选择应用',
    '选择方式并填写信息',
    deploymentMode === 'managed' ? '托管进度' : '安装命令',
  ];
  const hasAdvancedSection =
    advancedUserInputGroups.length > 0 || Boolean(serverHost || installPath);

  return (
    <Card className="border-border/80 bg-card/95">
      <CardHeader>
        <CardTitle>创建部署记录</CardTitle>
        <CardDescription>选择已购买的应用，再选择部署到自有服务器或交给平台托管。</CardDescription>
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
                    isActive && 'bg-foreground text-background',
                    isDone &&
                      'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
                    !isActive && !isDone && 'bg-muted text-muted-foreground',
                  )}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-card/20 text-[10px] font-semibold">
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
                        : 'border-border bg-card hover:border-border',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {getInitials(app.appName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{app.appName}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {app.appType}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {app.featureCount} 项能力
                        </span>
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
                        {entitlement.maxActiveDeployments} 个部署名额
                        {entitlement.boundDomain ? ` · 已绑定 ${entitlement.boundDomain}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedEntitlement ? (
                  <p className="text-xs text-muted-foreground">
                    {selectedEntitlement.domainBindingMode === 'lock_on_first_success'
                      ? `首次成功部署后将锁定 ${
                          manifest?.domainSlots.find(
                            (slot) => slot.sourceField === selectedEntitlement.domainBindingSource,
                          )?.label ?? selectedEntitlement.domainBindingSource
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

            <div className="space-y-3">
              <p className="text-sm font-bold">部署方式 *</p>
              <div className="grid gap-3 md:grid-cols-2">
                <Button
                  type="button"
                  variant={deploymentMode === 'self_hosted' ? 'default' : 'outline'}
                  aria-pressed={deploymentMode === 'self_hosted'}
                  onClick={() => setDeploymentMode('self_hosted')}
                >
                  客户自有服务器
                </Button>
                <Button
                  type="button"
                  variant={deploymentMode === 'managed' ? 'default' : 'outline'}
                  aria-pressed={deploymentMode === 'managed'}
                  disabled={!selectedApp?.managedAvailable || !deploymentOptions.data}
                  onClick={() => setDeploymentMode('managed')}
                >
                  平台托管
                </Button>
              </div>
              {!selectedApp?.managedAvailable ? (
                <p className="text-sm text-muted-foreground">
                  此应用的托管规格尚未配置，目前可部署到自有服务器。
                </p>
              ) : null}
              {deploymentMode === 'self_hosted' ? (
                <div className="space-y-2">
                  <Label htmlFor="wizard-server">服务器 IP *</Label>
                  <Input
                    id="wizard-server"
                    value={serverHost}
                    onChange={(event) => setServerHost(event.target.value)}
                    placeholder="服务器 IPv4 或 IPv6 地址"
                  />
                  <p className="text-xs text-muted-foreground">
                    创建后，在你的服务器上运行安装命令。请将应用域名解析到该服务器。
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-sm font-medium" htmlFor="wizard-hosting-purchase">
                    托管资格
                  </label>
                  <select
                    id="wizard-hosting-purchase"
                    className="h-10 w-full rounded-md border bg-background px-2"
                    value={hostingPurchaseId}
                    onChange={(e) => setHostingPurchaseId(e.target.value)}
                  >
                    <option value="">
                      {user?.role === 'admin'
                        ? '管理员人工安排（服务期需另行登记）'
                        : '请选择已购买的托管资格'}
                    </option>
                    {purchases.data?.items
                      .filter(
                        (p) =>
                          p.status === 'available' &&
                          p.appCode === selectedAppCode &&
                          (!p.item.hostingTerms?.target ||
                            p.item.hostingTerms.target.entitlementId === selectedEntitlementId),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.item.title} · {p.item.interval === 'month' ? '1 个月' : '1 年'}
                        </option>
                      ))}
                  </select>
                  {purchases.isError && (
                    <p role="alert" className="text-sm text-destructive">
                      托管资格读取失败，请刷新后重试。
                    </p>
                  )}
                  {selectedAppCode && selectedEntitlement && (
                    <HostingCheckout
                      appCode={selectedAppCode}
                      planCode={selectedEntitlement.planCode}
                      entitlementId={selectedEntitlement.id}
                    />
                  )}
                  <Label htmlFor="wizard-prefix">子域名前缀</Label>
                  <div className="flex gap-2">
                    <Input
                      id="wizard-prefix"
                      value={hostedPrefix}
                      onChange={(event) => setHostedPrefix(event.target.value.toLowerCase())}
                      placeholder="留空由平台自动生成"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setHostedPrefix(`app-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`)
                      }
                    >
                      自动生成
                    </Button>
                  </div>
                  <p className="text-sm">
                    {hostedPrefix || '自动生成的前缀'}.{deploymentOptions.data?.managedDomainSuffix}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    平台按可用容量分配服务器。当前可提交托管申请并预留地址，部署接入完成后才可访问。
                  </p>
                </div>
              )}
            </div>

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

            {deploymentMode === 'self_hosted' && manifest?.domainSlots.length ? (
              <div className="grid gap-4 md:grid-cols-3">
                {manifest.domainSlots.map((slot) => {
                  const value = domainValues[slot.sourceField] ?? '';
                  const onChange = (nextValue: string) => {
                    setDomainValues((current) => ({
                      ...current,
                      [slot.sourceField]: nextValue,
                    }));
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
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', advancedOpen && 'rotate-180')}
                />
              </button>
              {advancedOpen && (
                <div className="space-y-4 border-t border-border px-4 pt-3 pb-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2" hidden={deploymentMode === 'managed'}>
                      <Label htmlFor="wizard-install-path">安装路径</Label>
                      <Input
                        id="wizard-install-path"
                        disabled={deploymentMode === 'managed'}
                        value={installPath}
                        onChange={(event) => setInstallPath(event.target.value)}
                        placeholder={
                          selectedApp?.defaultInstallPath ?? '/opt/fd-headless-wp-system'
                        }
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
                        手动更新只记录新镜像可用状态，不自动切换；自动更新会在收到新镜像时直接应用。
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
                                  onChange={(event) =>
                                    setDraftSecret(field.key, event.target.value)
                                  }
                                  placeholder={field.placeholder}
                                />
                                {field.description ? (
                                  <p className="text-xs text-muted-foreground">
                                    {field.description}
                                  </p>
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
                onClick={handleAsync(handleCreate)}
              >
                {creating || issuing
                  ? '创建中...'
                  : deploymentMode === 'managed'
                    ? '提交托管申请'
                    : '创建部署'}
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                部署记录已创建成功
              </p>
              <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300/80">
                部署名称：<span className="font-bold">{label}</span>
              </p>
            </div>

            {managedResult ? <ManagedDeploymentProgress managed={managedResult} /> : null}
            {deploymentMode === 'self_hosted' && tokenResult ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-bold tracking-wide text-muted-foreground">
                    远程安装命令
                  </p>
                  <div className="relative">
                    <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 pr-10 text-xs text-slate-100">
                      {tokenResult.remoteInstallCommand ?? '当前未生成远程安装命令'}
                    </pre>
                    {tokenResult.remoteInstallCommand ? (
                      <button
                        type="button"
                        className="absolute top-2 right-2 rounded-lg bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                        onClick={() => handleCopyCommand(tokenResult.remoteInstallCommand!)}
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-border bg-card px-3 py-2">
                    <p className="text-[10px] font-semibold tracking-wide text-muted-foreground">
                      令牌尾号
                    </p>
                    <p className="mt-1 font-mono text-sm text-foreground">
                      {tokenResult.tokenHint}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-card px-3 py-2">
                    <p className="text-[10px] font-semibold tracking-wide text-muted-foreground">
                      过期时间
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {formatTime(tokenResult.expiresAt)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold tracking-wide text-muted-foreground">兑换地址</p>
                  <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                    {tokenResult.exchangeUrl}
                  </pre>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold tracking-wide text-muted-foreground">
                    一次性令牌
                  </p>
                  <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                    {tokenResult.token}
                  </pre>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold tracking-wide text-muted-foreground">
                    调试命令（cURL）
                  </p>
                  <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                    {tokenResult.exchangeCurl}
                  </pre>
                </div>
              </div>
            ) : deploymentMode === 'self_hosted' ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">
                  部署令牌签发未能完成，请在下方部署列表中手动签发。
                </p>
              </div>
            ) : null}

            <div className="flex justify-end pt-2">
              <Button onClick={handleReset}>完成</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
