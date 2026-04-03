import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { toast } from 'sonner';

import type { DeliveryManifest, IssueDeploymentTokenResult } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, getInitials, formatTime } from '@/lib/utils';

export interface DeployableAppOption {
  productCode: string;
  productName: string;
  featureCount: number;
  appCode: string;
  profileName: string;
  productType: string;
  deliveryManifest?: DeliveryManifest | null;
}

export interface CreateDeploymentPayload {
  appCode: string;
  productCode?: string;
  label: string;
  environment: string;
  serverHost?: string;
  primaryDomain?: string;
  adminDomain?: string;
  wsDomain?: string;
  endpoints?: Record<string, string>;
  installPath?: string;
}

export interface DeploymentWizardProps {
  options: DeployableAppOption[];
  onCreateDeployment: (payload: CreateDeploymentPayload) => Promise<{ id: string }>;
  onIssueToken: (params: { deploymentId: string; expiresInHours: number }) => Promise<IssueDeploymentTokenResult>;
  creating: boolean;
  issuing: boolean;
}

type WizardStep = 1 | 2 | 3;

export function DeploymentWizard({ options, onCreateDeployment, onIssueToken, creating, issuing }: DeploymentWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedProductCode, setSelectedProductCode] = useState('');
  const [label, setLabel] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [serverHost, setServerHost] = useState('');
  const [installPath, setInstallPath] = useState('/opt/fd-headless-wp-system');
  const [endpointValues, setEndpointValues] = useState<Record<string, string>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [tokenResult, setTokenResult] = useState<IssueDeploymentTokenResult | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedProduct = useMemo(
    () => options.find((option) => option.productCode === selectedProductCode) ?? null,
    [options, selectedProductCode]
  );

  useEffect(() => {
    if (selectedProduct && !label) {
      setLabel(`${selectedProduct.productName} Production`);
    }
  }, [selectedProduct, label]);

  useEffect(() => {
    if (!selectedProduct?.deliveryManifest) {
      return;
    }

    setInstallPath(selectedProduct.deliveryManifest.installer.installPath);
    setEndpointValues((current) =>
      Object.fromEntries(selectedProduct.deliveryManifest?.domainSlots.map((slot) => [slot.key, current[slot.key] ?? '']) ?? [])
    );
  }, [selectedProduct]);

  const handleSelectProduct = useCallback((productCode: string) => {
    setSelectedProductCode(productCode);
    setLabel('');
  }, []);

  const domainSlots = selectedProduct?.deliveryManifest?.domainSlots ?? [];
  const findLegacyFieldValue = useCallback(
    (sourceField: 'primaryDomain' | 'adminDomain' | 'wsDomain') =>
      endpointValues[domainSlots.find((slot) => slot.sourceField === sourceField)?.key ?? ''] || undefined,
    [domainSlots, endpointValues]
  );

  const handleCreate = useCallback(async () => {
    const payload: CreateDeploymentPayload = {
      appCode: selectedProduct?.appCode ?? '',
      productCode: selectedProduct?.productCode,
      label,
      environment,
      serverHost: serverHost || undefined,
      primaryDomain: findLegacyFieldValue('primaryDomain'),
      adminDomain: findLegacyFieldValue('adminDomain'),
      wsDomain: findLegacyFieldValue('wsDomain'),
      endpoints: Object.fromEntries(
        Object.entries(endpointValues).filter(([, value]) => value.trim().length > 0)
      ),
      installPath: installPath || undefined
    };

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
  }, [selectedProduct, label, environment, serverHost, endpointValues, installPath, onCreateDeployment, onIssueToken, findLegacyFieldValue]);

  const handleReset = useCallback(() => {
    setStep(1);
    setSelectedProductCode('');
    setLabel('');
    setEnvironment('production');
    setServerHost('');
    setEndpointValues({});
    setInstallPath('/opt/fd-headless-wp-system');
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

  const stepLabels = ['选择产品', '填写部署信息', '安装命令'];

  return (
    <Card className="border-slate-200/80 bg-white/95">
      <CardHeader>
        <CardTitle>创建部署记录</CardTitle>
        <CardDescription>通过三步向导完成部署配置：选择产品、填写信息、获取安装命令。</CardDescription>
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
                    !isActive && !isDone && 'bg-muted text-muted-foreground'
                  )}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-black">
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
            <p className="text-sm text-muted-foreground">选择一个已购且可部署的产品来创建部署记录。</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {options.map((product) => {
                const isSelected = selectedProductCode === product.productCode;
                return (
                  <button
                    key={`${product.productCode}:${product.appCode}`}
                    type="button"
                    onClick={() => handleSelectProduct(product.productCode)}
                    className={cn(
                      'flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all hover:shadow-sm',
                      isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-white hover:border-slate-300'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black',
                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-slate-100 text-slate-600'
                      )}
                    >
                      {getInitials(product.productName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{product.productName}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">{product.productType}</Badge>
                        <span className="text-xs text-muted-foreground">{product.featureCount} 个有效能力</span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">交付档案：{product.profileName}</p>
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
              <Button disabled={!selectedProductCode} onClick={() => setStep(2)}>
                下一步
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wizard-label">部署名称 *</Label>
                <Input
                  id="wizard-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="FutureDecade Production"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-env">环境</Label>
                <Input
                  id="wizard-env"
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  placeholder="production"
                />
              </div>
            </div>

            {domainSlots.length > 0 ? (
              <div className="space-y-3 md:col-span-2">
                <Label>域名槽位</Label>
                <div className="grid gap-4 md:grid-cols-2">
                  {domainSlots.map((slot) => (
                    <div key={slot.key} className="space-y-2">
                      <Label htmlFor={`wizard-domain-${slot.key}`}>
                        {slot.label}
                        {slot.required ? ' *' : ''}
                      </Label>
                      <Input
                        id={`wizard-domain-${slot.key}`}
                        value={endpointValues[slot.key] ?? ''}
                        onChange={(e) =>
                          setEndpointValues((current) => ({ ...current, [slot.key]: e.target.value }))
                        }
                        placeholder={slot.placeholder || `${slot.key}.example.com`}
                      />
                      {slot.description ? (
                        <p className="text-xs text-muted-foreground">{slot.description}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="wizard-primary-domain">主域名</Label>
                <Input
                  id="wizard-primary-domain"
                  value={endpointValues.frontend ?? ''}
                  onChange={(e) =>
                    setEndpointValues((current) => ({ ...current, frontend: e.target.value }))
                  }
                  placeholder="www.futuredecade.com"
                />
              </div>
            )}

            <div className="rounded-2xl border border-border">
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
                        onChange={(e) => setServerHost(e.target.value)}
                        placeholder="144.48.8.218"
                      />
                    </div>
                    {domainSlots.length === 0 ? (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="wizard-admin-domain">后台域名</Label>
                          <Input
                            id="wizard-admin-domain"
                            value={endpointValues.admin ?? ''}
                            onChange={(e) =>
                              setEndpointValues((current) => ({ ...current, admin: e.target.value }))
                            }
                            placeholder="admin.futuredecade.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="wizard-ws-domain">WS 域名</Label>
                          <Input
                            id="wizard-ws-domain"
                            value={endpointValues.ws ?? ''}
                            onChange={(e) =>
                              setEndpointValues((current) => ({ ...current, ws: e.target.value }))
                            }
                            placeholder="ws.futuredecade.com"
                          />
                        </div>
                      </>
                    ) : null}
                    <div className="space-y-2">
                      <Label htmlFor="wizard-install-path">安装路径</Label>
                      <Input
                        id="wizard-install-path"
                        value={installPath}
                        onChange={(e) => setInstallPath(e.target.value)}
                        placeholder="/opt/fd-headless-wp-system"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                上一步
              </Button>
              <Button
                disabled={!selectedProductCode || !label.trim() || creating || issuing}
                onClick={handleCreate}
              >
                {creating || issuing ? '创建中...' : '创建部署'}
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-bold text-green-800">部署记录已创建成功</p>
              <p className="mt-1 text-sm text-green-700">
                部署名称：<span className="font-bold">{label}</span>
              </p>
            </div>

            {tokenResult ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Remote Install Command</p>
                  <div className="relative">
                    <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 pr-10 text-xs text-slate-100">
                      {tokenResult.remoteInstallCommand ?? '当前未生成远程安装命令'}
                    </pre>
                    {tokenResult.remoteInstallCommand && (
                      <button
                        type="button"
                        className="absolute right-2 top-2 rounded-lg bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                        onClick={() => handleCopyCommand(tokenResult.remoteInstallCommand!)}
                      >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Token 尾号</p>
                    <p className="mt-1 font-mono text-sm text-slate-900">{tokenResult.tokenHint}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">过期时间</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{formatTime(tokenResult.expiresAt)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Exchange URL</p>
                  <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{tokenResult.exchangeUrl}</pre>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">One-time Token</p>
                  <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{tokenResult.token}</pre>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Exchange Curl</p>
                  <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{tokenResult.exchangeCurl}</pre>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">部署令牌签发未能完成，请在下方部署列表中手动签发。</p>
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
