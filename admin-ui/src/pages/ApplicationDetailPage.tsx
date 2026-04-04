import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, KeyRound, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { createAppSecret, listAppsAdmin, listCatalogProducts, revokeAppSecret, syncAppDeliveryManifest, upsertApp } from '@/api/apps';
import { getDeliverySettings } from '@/api/delivery';
import type { AppWithDetails, ProductSummary } from '@/api/types';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { formatTime } from '@/lib/utils';

type ApplicationFormState = {
  code: string;
  name: string;
  description: string;
  type: string;
  status: string;
  callbackUrl: string;
  callbackSecret: string;
  allowedOrigins: string;
  deliveryMode: 'direct_access' | 'one_click_deploy';
  repoUrl: string;
  repoBranch: string;
  manifestPath: string;
  manifestUrl: string;
  productCodes: string[];
};

function createEmptyForm(): ApplicationFormState {
  return {
    code: '',
    name: '',
    description: '',
    type: 'web_app',
    status: 'active',
    callbackUrl: '',
    callbackSecret: '',
    allowedOrigins: '',
    deliveryMode: 'one_click_deploy',
    repoUrl: '',
    repoBranch: 'main',
    manifestPath: 'fd-delivery.manifest.json',
    manifestUrl: '',
    productCodes: []
  };
}

function readMetaText(meta: Record<string, unknown> | undefined, key: string) {
  const value = meta?.[key];
  return typeof value === 'string' ? value : '';
}

function readMetaList(meta: Record<string, unknown> | undefined, key: string) {
  const value = meta?.[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').join('\n');
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

function buildForm(app: AppWithDetails | null): ApplicationFormState {
  if (!app) {
    return createEmptyForm();
  }

  const meta = app.meta && typeof app.meta === 'object' && !Array.isArray(app.meta)
    ? (app.meta as Record<string, unknown>)
    : {};
  const source = meta.deliveryManifestSource && typeof meta.deliveryManifestSource === 'object' && !Array.isArray(meta.deliveryManifestSource)
    ? (meta.deliveryManifestSource as Record<string, unknown>)
    : {};

  return {
    code: app.code,
    name: app.name,
    description: app.description ?? '',
    type: app.type,
    status: app.status,
    callbackUrl: readMetaText(meta, 'callbackUrl'),
    callbackSecret: readMetaText(meta, 'callbackSecret'),
    allowedOrigins: readMetaList(meta, 'allowedOrigins'),
    deliveryMode:
      meta.productDeliveryMode === 'direct_access' || meta.productDeliveryMode === 'one_click_deploy'
        ? meta.productDeliveryMode
        : app.type === 'chrome_extension'
          ? 'direct_access'
          : 'one_click_deploy',
    repoUrl: typeof source.repoUrl === 'string' ? source.repoUrl : '',
    repoBranch: typeof source.repoBranch === 'string' ? source.repoBranch : 'main',
    manifestPath: typeof source.manifestPath === 'string' ? source.manifestPath : 'fd-delivery.manifest.json',
    manifestUrl: typeof source.manifestUrl === 'string' ? source.manifestUrl : '',
    productCodes: app.products?.map((product) => product.code) ?? []
  };
}

function mapCheckoutOffers(app: AppWithDetails | null) {
  return (app?.checkoutOffers ?? []).map((offer) => ({
    code: offer.code,
    priceCode: offer.priceCode,
    title: offer.title,
    description: offer.description ?? undefined,
    badge: offer.badge ?? undefined,
    priceAmount: offer.priceAmount,
    currency: offer.currency,
    status: offer.status,
    isDefault: offer.isDefault,
    sortOrder: offer.sortOrder
  }));
}

function buildApiRows(appCode: string) {
  return [
    { label: '应用标识', value: appCode || '待保存后生成' },
    { label: '公开目录接口', value: appCode ? `/v1/apps/${appCode}/catalog` : '/v1/apps/:appCode/catalog' },
    { label: '管理接入接口', value: appCode ? `/v1/admin/apps/${appCode}` : '/v1/admin/apps/:appCode' },
    { label: '鉴权方式', value: '应用密钥 + 管理员后台配置' }
  ];
}

export function ApplicationDetailPage() {
  const { appCode } = useParams<{ appCode?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isCreateMode = !appCode || appCode === 'new';

  const appsQuery = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const productsQuery = useQuery({ queryKey: ['catalog-products'], queryFn: listCatalogProducts });

  const app = useMemo(
    () => (isCreateMode ? null : (appsQuery.data?.items ?? []).find((item) => item.code === appCode) ?? null),
    [appCode, appsQuery.data?.items, isCreateMode]
  );

  const [form, setForm] = useState<ApplicationFormState>(createEmptyForm());
  const [initializedCode, setInitializedCode] = useState<string | null>(null);
  const [latestSecret, setLatestSecret] = useState<string | null>(null);

  useEffect(() => {
    const targetCode = isCreateMode ? '__new__' : (app?.code ?? null);
    if (!targetCode || initializedCode === targetCode) {
      return;
    }

    setForm(buildForm(app));
    setInitializedCode(targetCode);
    setLatestSecret(null);
  }, [app, initializedCode, isCreateMode]);

  const deliverySettingsQuery = useQuery({
    queryKey: ['delivery-settings', app?.code],
    queryFn: () => getDeliverySettings(app!.code),
    enabled: Boolean(app?.code),
    retry: false
  });

  const availableProducts = productsQuery.data?.items ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const code = form.code.trim();
      if (!code) {
        throw new Error('请先填写应用标识');
      }

      const allowedOrigins = form.allowedOrigins
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean);

      const meta = { ...(app?.meta ?? {}) } as Record<string, unknown>;
      if (form.callbackUrl.trim()) {
        meta.callbackUrl = form.callbackUrl.trim();
      } else {
        delete meta.callbackUrl;
      }
      if (form.callbackSecret.trim()) {
        meta.callbackSecret = form.callbackSecret.trim();
      } else {
        delete meta.callbackSecret;
      }
      if (allowedOrigins.length > 0) {
        meta.allowedOrigins = allowedOrigins;
      } else {
        delete meta.allowedOrigins;
      }
      meta.productDeliveryMode = form.deliveryMode;
      meta.deliveryManifestSource = {
        repoUrl: form.repoUrl.trim() || undefined,
        repoBranch: form.repoBranch.trim() || undefined,
        manifestPath: form.manifestPath.trim() || undefined,
        manifestUrl: form.manifestUrl.trim() || undefined
      };

      return upsertApp(code, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        type: form.type,
        status: form.status,
        productCodes: form.productCodes,
        checkoutOffers: mapCheckoutOffers(app),
        checkoutDefaultOfferCode: app?.checkoutOffers?.find((offer) => offer.isDefault)?.code,
        meta
      });
    },
    onSuccess: (saved) => {
      toast.success(isCreateMode ? '应用已创建' : '应用配置已保存');
      setForm(buildForm(saved));
      setInitializedCode(saved.code);
      void qc.invalidateQueries({ queryKey: ['apps'] });
      if (isCreateMode) {
        navigate(`/admin/applications/${saved.code}`, { replace: true });
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '保存失败')
  });

  const createSecretMutation = useMutation({
    mutationFn: async () => {
      const code = app?.code ?? form.code.trim();
      if (!code) {
        throw new Error('请先保存应用，再生成密钥');
      }
      return createAppSecret(code);
    },
    onSuccess: (result) => {
      setLatestSecret(result.secret);
      toast.success('已生成新密钥，新密钥只会显示这一次');
      void qc.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '生成密钥失败')
  });

  const revokeSecretMutation = useMutation({
    mutationFn: ({ code, secretId }: { code: string; secretId: string }) => revokeAppSecret(code, secretId),
    onSuccess: () => {
      toast.success('密钥已撤销');
      void qc.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '撤销失败')
  });

  const syncManifestMutation = useMutation({
    mutationFn: async () => {
      const code = app?.code ?? form.code.trim();
      if (!code) {
        throw new Error('请先保存应用，再同步交付声明');
      }
      return syncAppDeliveryManifest(code, {
        repoUrl: form.repoUrl.trim() || undefined,
        repoBranch: form.repoBranch.trim() || undefined,
        manifestPath: form.manifestPath.trim() || undefined,
        manifestUrl: form.manifestUrl.trim() || undefined
      });
    },
    onSuccess: () => {
      toast.success('交付声明已同步');
      void qc.invalidateQueries({ queryKey: ['apps'] });
      void qc.invalidateQueries({ queryKey: ['delivery-settings', app?.code ?? form.code.trim()] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '同步失败')
  });

  const selectedProducts = useMemo(
    () => new Set(form.productCodes),
    [form.productCodes]
  );

  const currentCode = app?.code ?? form.code.trim();
  const secrets = app?.secrets ?? [];
  const apiRows = buildApiRows(currentCode);
  const deliverySettings = deliverySettingsQuery.data;

  const setField = <Key extends keyof ApplicationFormState>(key: Key, value: ApplicationFormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div>
      <SectionHeader sectionKey="applications" />
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" asChild>
              <Link to="/admin/applications">
                <ArrowLeft className="mr-1 h-4 w-4" />
                返回应用列表
              </Link>
            </Button>
            <div>
              <h2 className="text-[28px] font-black tracking-tight text-slate-900">
                {isCreateMode ? '新建应用' : form.name || app?.name || form.code}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isCreateMode && app ? (
              <StatusPill tone={statusToTone(app.status)} label={app.status} />
            ) : null}
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="mr-1 h-4 w-4" />
              {saveMutation.isPending ? '保存中...' : '保存应用配置'}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="basic" className="space-y-6">
          <TabsList className="flex h-auto flex-wrap gap-2 rounded-2xl bg-transparent p-0">
            <TabsTrigger value="basic">基本信息</TabsTrigger>
            <TabsTrigger value="secrets">应用密钥</TabsTrigger>
            <TabsTrigger value="api">API 接入信息</TabsTrigger>
            <TabsTrigger value="callbacks">回调配置</TabsTrigger>
            <TabsTrigger value="delivery">交付/部署配置</TabsTrigger>
            <TabsTrigger value="products">可售产品</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>基本信息</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>应用标识</Label>
                  <Input value={form.code} onChange={(event) => setField('code', event.target.value)} placeholder="my_app" disabled={!isCreateMode} />
                </div>
                <div className="space-y-2">
                  <Label>应用名称</Label>
                  <Input value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="我的应用" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>技术说明</Label>
                  <Textarea value={form.description} onChange={(event) => setField('description', event.target.value)} className="min-h-[120px]" placeholder="描述应用的接入用途、运行方式和边界。" />
                </div>
                <div className="space-y-2">
                  <Label>应用类型</Label>
                  <Select value={form.type} onValueChange={(value) => setField('type', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chrome_extension">Chrome Extension</SelectItem>
                      <SelectItem value="web_app">Web App</SelectItem>
                      <SelectItem value="service">Service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>状态</Label>
                  <Select value={form.status} onValueChange={(value) => setField('status', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">active</SelectItem>
                      <SelectItem value="inactive">inactive</SelectItem>
                      <SelectItem value="cancelled">cancelled</SelectItem>
                      <SelectItem value="expired">expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="secrets" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>应用密钥</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                  <div>
                    <p className="text-sm font-black text-foreground">当前共有 {secrets.length} 个密钥</p>
                    <p className="text-xs text-muted-foreground">保存应用后即可创建新密钥。撤销后旧密钥立即失效。</p>
                  </div>
                  <Button onClick={() => createSecretMutation.mutate()} disabled={createSecretMutation.isPending}>
                    <KeyRound className="mr-1 h-4 w-4" />
                    {createSecretMutation.isPending ? '生成中...' : '生成新密钥'}
                  </Button>
                </div>
                {latestSecret ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <p className="text-xs font-black uppercase tracking-wider text-emerald-700">新密钥，仅显示一次</p>
                    <p className="mt-2 break-all font-mono text-sm text-emerald-900">{latestSecret}</p>
                  </div>
                ) : null}
                <div className="space-y-3">
                  {secrets.map((secret) => (
                    <div key={secret.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-black text-foreground">{secret.hint}</p>
                        <p className="text-xs font-mono text-muted-foreground">{secret.id}</p>
                        <p className="text-xs text-muted-foreground">
                          创建于 {formatTime(secret.createdAt)} {secret.expiresAt ? `，过期于 ${formatTime(secret.expiresAt)}` : '，长期有效'}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        disabled={revokeSecretMutation.isPending}
                        onClick={() => {
                          const code = app?.code ?? form.code.trim();
                          if (!code) {
                            toast.error('请先保存应用');
                            return;
                          }
                          if (confirm(`确认撤销密钥 ${secret.hint} 吗？`)) {
                            revokeSecretMutation.mutate({ code, secretId: secret.id });
                          }
                        }}
                      >
                        撤销
                      </Button>
                    </div>
                  ))}
                  {!appsQuery.isLoading && secrets.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center text-sm text-muted-foreground">
                      暂无密钥，保存应用后可以生成第一把接入密钥。
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>API 接入信息</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {apiRows.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-border bg-white p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">{item.label}</p>
                    <p className="mt-2 break-all font-mono text-sm text-foreground">{item.value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

          </TabsContent>

          <TabsContent value="callbacks" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>回调配置</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="space-y-2">
                  <Label>回调地址</Label>
                  <Input value={form.callbackUrl} onChange={(event) => setField('callbackUrl', event.target.value)} placeholder="https://app.example.com/webhooks/fd-core" />
                </div>
                <div className="space-y-2">
                  <Label>回调密钥</Label>
                  <Input value={form.callbackSecret} onChange={(event) => setField('callbackSecret', event.target.value)} placeholder="用于签名校验的共享密钥" />
                </div>
                <div className="space-y-2">
                  <Label>允许来源</Label>
                  <Textarea
                    value={form.allowedOrigins}
                    onChange={(event) => setField('allowedOrigins', event.target.value)}
                    className="min-h-[120px] font-mono text-xs"
                    placeholder={'https://app.example.com\nhttps://admin.example.com'}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="delivery" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>交付/部署配置</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>交付模式</Label>
                  <Select value={form.deliveryMode} onValueChange={(value) => setField('deliveryMode', value as ApplicationFormState['deliveryMode'])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct_access">direct_access</SelectItem>
                      <SelectItem value="one_click_deploy">one_click_deploy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>仓库地址</Label>
                  <Input value={form.repoUrl} onChange={(event) => setField('repoUrl', event.target.value)} placeholder="https://github.com/org/repo" />
                </div>
                <div className="space-y-2">
                  <Label>仓库分支</Label>
                  <Input value={form.repoBranch} onChange={(event) => setField('repoBranch', event.target.value)} placeholder="main" />
                </div>
                <div className="space-y-2">
                  <Label>Manifest 路径</Label>
                  <Input value={form.manifestPath} onChange={(event) => setField('manifestPath', event.target.value)} placeholder="fd-delivery.manifest.json" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Manifest URL</Label>
                  <Input value={form.manifestUrl} onChange={(event) => setField('manifestUrl', event.target.value)} placeholder="https://raw.githubusercontent.com/..." />
                </div>
                <div className="md:col-span-2">
                  <Separator className="mb-4" />
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-black text-foreground">交付声明状态</p>
                      <p className="text-xs text-muted-foreground">
                        {deliverySettings?.configured
                          ? `已配置 ${deliverySettings.manifest.envFields.length + deliverySettings.manifest.secretFields.length} 个交付字段`
                          : app?.meta?.deliveryManifest
                            ? '已同步 delivery manifest，交付设置尚未全部预设'
                            : '尚未同步 delivery manifest'}
                      </p>
                    </div>
                    <Button onClick={() => syncManifestMutation.mutate()} disabled={syncManifestMutation.isPending || !currentCode}>
                      <RefreshCw className="mr-1 h-4 w-4" />
                      {syncManifestMutation.isPending ? '同步中...' : '同步交付声明'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>可售产品绑定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  {availableProducts.map((product: ProductSummary) => (
                    <label
                      key={product.code}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-white p-4"
                    >
                      <Checkbox
                        checked={selectedProducts.has(product.code)}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...form.productCodes, product.code]
                            : form.productCodes.filter((code) => code !== product.code);
                          setField('productCodes', next);
                        }}
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-black text-foreground">{product.name}</p>
                        <p className="text-xs font-mono text-muted-foreground">{product.code}</p>
                        <div className="flex gap-2">
                          <StatusPill tone="neutral" label={product.type || 'service'} />
                          <StatusPill tone={statusToTone(product.status || 'inactive')} label={product.status || 'inactive'} />
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                {!productsQuery.isLoading && availableProducts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center text-sm text-muted-foreground">
                    暂无产品，请先去商品建模里创建产品。
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {!isCreateMode && app ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>可售产品</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-black text-foreground">{app.products?.length ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">当前应用绑定的商品数量。</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>应用密钥</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-black text-foreground">{app.secrets?.length ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">用于中台接入的有效密钥记录。</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>交付状态</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <StatusPill tone="neutral" label={form.deliveryMode} />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {app.meta?.deliveryManifest ? '已同步交付声明' : '未同步交付声明'}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
