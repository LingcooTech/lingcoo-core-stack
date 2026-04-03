import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileCog, KeyRound, PackageCheck, PackageSearch, Plus, Rocket, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { listAppsAdmin, syncAppDeliveryManifest, upsertApp, upsertCatalogBundle } from '@/api/apps';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CatalogBundleDialog } from '@/components/apps/CatalogBundleDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { StatusPill } from '@/components/shared/StatusPill';
import { useCatalogData } from '@/hooks/useCatalogData';
import { createEmptyOffer, formatPlanInterval, offersFromApp, slugify, type EditableOffer } from '@/lib/catalog-utils';
import { getLinkedAppsForProduct, getPrimaryAppForProduct, productNeedsDedicatedProfile } from '@/lib/product-model';

type DeliveryManifestSourceState = {
  repoUrl: string;
  repoBranch: string;
  manifestPath: string;
  manifestUrl: string;
};

type WorkspaceForm = {
  name: string;
  tagline: string;
  category: string;
  type: 'chrome_extension' | 'web_app' | 'service';
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
  iconUrl: string;
  coverUrl: string;
  content: string;
};

function createDefaultForm(product: { name: string; type?: string; status?: string }) {
  return {
    name: product.name,
    tagline: '',
    category: '',
    type: ((product.type as WorkspaceForm['type']) || 'service'),
    status: ((product.status as WorkspaceForm['status']) || 'active'),
    iconUrl: '',
    coverUrl: '',
    content: ''
  } satisfies WorkspaceForm;
}

export function ProductWorkspacePage() {
  const { productCode } = useParams<{ productCode: string }>();
  const qc = useQueryClient();
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [form, setForm] = useState<WorkspaceForm | null>(null);
  const [editableOffers, setEditableOffers] = useState<EditableOffer[]>([]);
  const [deliverySource, setDeliverySource] = useState<DeliveryManifestSourceState>({
    repoUrl: '',
    repoBranch: 'main',
    manifestPath: 'fd-delivery.manifest.json',
    manifestUrl: ''
  });
  const [initializedProfileCode, setInitializedProfileCode] = useState<string | null>(null);

  const { catalogBundles, allPlans, products, isLoading: isCatalogLoading } = useCatalogData();
  const appsQuery = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const apps = appsQuery.data?.items ?? [];

  const bundle = useMemo(
    () => catalogBundles.find((item) => item.product.code === productCode) ?? null,
    [catalogBundles, productCode]
  );
  const product = bundle?.product ?? products.find((item) => item.code === productCode) ?? null;
  const linkedApps = useMemo(() => (product ? getLinkedAppsForProduct(product.code, apps) : []), [apps, product]);
  const primaryApp = useMemo(() => (product ? getPrimaryAppForProduct(product.code, apps) : null), [apps, product]);
  const needsDedicatedProfile = productNeedsDedicatedProfile(productCode ?? '', primaryApp);
  const targetProfileCode = needsDedicatedProfile ? (product?.code ?? '') : (primaryApp?.code ?? product?.code ?? '');
  const availablePlans = useMemo(
    () => allPlans.filter((plan) => plan.productCode === productCode),
    [allPlans, productCode]
  );
  const hasDeliveryManifest = Boolean(primaryApp?.meta?.deliveryManifest);
  const activeSecrets = primaryApp?.secrets?.filter((secret) => !secret.expiresAt || new Date(secret.expiresAt) > new Date()).length ?? 0;

  useEffect(() => {
    if (!product || !targetProfileCode || initializedProfileCode === targetProfileCode) {
      return;
    }

    if (primaryApp) {
      const deliveryManifestSource =
        primaryApp.meta && typeof primaryApp.meta.deliveryManifestSource === 'object' && primaryApp.meta.deliveryManifestSource
          ? (primaryApp.meta.deliveryManifestSource as Record<string, unknown>)
          : {};

      setForm({
        name: primaryApp.name,
        tagline: primaryApp.tagline ?? '',
        category: primaryApp.category ?? '',
        type: primaryApp.type as WorkspaceForm['type'],
        status: primaryApp.status as WorkspaceForm['status'],
        iconUrl: primaryApp.iconUrl ?? '',
        coverUrl: primaryApp.coverUrl ?? '',
        content: primaryApp.content ?? ''
      });
      setEditableOffers(offersFromApp(primaryApp));
      setDeliverySource({
        repoUrl: typeof deliveryManifestSource.repoUrl === 'string' ? deliveryManifestSource.repoUrl : '',
        repoBranch: typeof deliveryManifestSource.repoBranch === 'string' ? deliveryManifestSource.repoBranch : 'main',
        manifestPath:
          typeof deliveryManifestSource.manifestPath === 'string'
            ? deliveryManifestSource.manifestPath
            : 'fd-delivery.manifest.json',
        manifestUrl: typeof deliveryManifestSource.manifestUrl === 'string' ? deliveryManifestSource.manifestUrl : ''
      });
    } else {
      setForm(createDefaultForm(product));
      setEditableOffers([]);
      setDeliverySource({
        repoUrl: '',
        repoBranch: 'main',
        manifestPath: 'fd-delivery.manifest.json',
        manifestUrl: ''
      });
    }

    setInitializedProfileCode(targetProfileCode);
  }, [initializedProfileCode, primaryApp, product, targetProfileCode]);

  const catalogMutation = useMutation({
    mutationFn: ({
      nextProductCode,
      values
    }: {
      nextProductCode: string;
      values: Parameters<typeof upsertCatalogBundle>[1];
    }) => upsertCatalogBundle(nextProductCode, values),
    onSuccess: () => {
      toast.success('产品能力与授权方案已保存');
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      void qc.invalidateQueries({ queryKey: ['apps'] });
      setCatalogDialogOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存产品失败')
  });

  const profileMutation = useMutation({
    mutationFn: async () => {
      if (!product || !form || !targetProfileCode) {
        throw new Error('产品上下文缺失');
      }

      const checkoutOffers = editableOffers
        .map((offer, index) => ({
          code: slugify(offer.code),
          planCode: offer.planCode,
          title: offer.title.trim(),
          description: offer.description.trim(),
          badge: offer.badge.trim(),
          priceAmount: Math.round(Number(offer.priceYuan || '0') * 100),
          currency: offer.currency.trim().toUpperCase() || 'CNY',
          status: offer.status,
          isDefault: offer.isDefault,
          sortOrder: index
        }))
        .filter((offer) => offer.code && offer.planCode && offer.title);

      const checkoutDefaultOfferCode =
        checkoutOffers.find((offer) => offer.isDefault)?.code ||
        checkoutOffers[0]?.code ||
        undefined;

      const meta = { ...((needsDedicatedProfile ? {} : primaryApp?.meta) ?? {}) };
      delete meta.checkoutPlanCode;
      delete meta.checkoutOffers;
      delete meta.checkoutDefaultOfferCode;
      meta.deliveryManifestSource = {
        repoUrl: deliverySource.repoUrl || undefined,
        repoBranch: deliverySource.repoBranch || undefined,
        manifestPath: deliverySource.manifestPath || undefined,
        manifestUrl: deliverySource.manifestUrl || undefined
      };

      return upsertApp(targetProfileCode, {
        name: form.name,
        tagline: form.tagline || undefined,
        category: form.category || undefined,
        type: form.type,
        status: form.status,
        iconUrl: form.iconUrl || undefined,
        coverUrl: form.coverUrl || undefined,
        content: form.content || undefined,
        productCodes: [product.code],
        checkoutOffers,
        checkoutDefaultOfferCode,
        meta
      });
    },
    onSuccess: () => {
      toast.success('产品销售与交付档案已保存');
      void qc.invalidateQueries({ queryKey: ['apps'] });
      setInitializedProfileCode(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败')
  });

  const syncManifestMutation = useMutation({
    mutationFn: async () => {
      if (!targetProfileCode) {
        throw new Error('产品档案尚未初始化');
      }

      return syncAppDeliveryManifest(targetProfileCode, {
        repoUrl: deliverySource.repoUrl || undefined,
        repoBranch: deliverySource.repoBranch || undefined,
        manifestPath: deliverySource.manifestPath || undefined,
        manifestUrl: deliverySource.manifestUrl || undefined
      });
    },
    onSuccess: () => {
      toast.success('交付声明已同步');
      void qc.invalidateQueries({ queryKey: ['apps'] });
      setInitializedProfileCode(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '同步失败')
  });

  if (isCatalogLoading || appsQuery.isLoading || !form) {
    return <div className="p-6 text-sm text-muted-foreground">加载产品工作台中...</div>;
  }

  if (!product || !bundle) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-border bg-white p-6 text-sm text-muted-foreground">
          未找到产品 {productCode}
        </div>
      </div>
    );
  }

  const addOffer = () => {
    const seedPlan = availablePlans[0];
    setEditableOffers((current) => {
      const next = [...current, createEmptyOffer(seedPlan)];
      if (next.length === 1) {
        next[0] = { ...next[0], isDefault: true };
      }
      return next;
    });
  };

  const removeOffer = (offerId: string) => {
    setEditableOffers((current) => {
      const next = current.filter((offer) => offer.id !== offerId);
      if (next.length > 0 && !next.some((offer) => offer.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      return next;
    });
  };

  const updateOffer = (offerId: string, updater: (current: EditableOffer) => EditableOffer) => {
    setEditableOffers((current) => current.map((offer) => (offer.id === offerId ? updater(offer) : offer)));
  };

  const markDefaultOffer = (offerId: string) => {
    setEditableOffers((current) => current.map((offer) => ({ ...offer, isDefault: offer.id === offerId })));
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" asChild>
            <Link to="/admin/products">
              <ArrowLeft className="mr-1 h-4 w-4" />
              返回产品中心
            </Link>
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div>
            <p className="text-xl font-black text-foreground">{product.name}</p>
            <p className="text-xs font-mono text-muted-foreground">{product.code}</p>
          </div>
        </div>
        <Button onClick={() => profileMutation.mutate()} disabled={profileMutation.isPending}>
          {profileMutation.isPending ? '保存中...' : '保存产品档案'}
        </Button>
      </div>

      {linkedApps.length > 1 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          当前产品绑定了 {linkedApps.length} 个内部档案。简化模式将优先使用 <span className="font-mono">{primaryApp?.code}</span> 作为销售与交付主档案。
        </div>
      ) : null}

      {needsDedicatedProfile ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          当前产品仍在复用共享内部档案 <span className="font-mono">{primaryApp?.code}</span>。为避免一个档案同时服务多个产品，下一次保存将自动为当前产品创建专属档案 <span className="font-mono">{product.code}</span>。
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <WorkspaceMetric
          label="能力项"
          value={String(bundle.features.length)}
          note="授权能力组合"
          tone="neutral"
        />
        <WorkspaceMetric
          label="授权方案"
          value={String(bundle.plans.length)}
          note="可售卖计划"
          tone="neutral"
        />
        <WorkspaceMetric
          label="交付声明"
          value={hasDeliveryManifest ? '已接入' : '待同步'}
          note={targetProfileCode || '待创建内部档案'}
          tone={hasDeliveryManifest ? 'ok' : 'warn'}
        />
        <WorkspaceMetric
          label="接入密钥"
          value={String(activeSecrets)}
          note="当前有效密钥"
          tone={activeSecrets > 0 ? 'ok' : 'neutral'}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>产品定义</CardTitle>
            <CardDescription>产品本体、能力项和授权方案仍然是授权引擎的基础，但现在统一在产品工作台入口下管理。</CardDescription>
          </div>
          <Button variant="outline" onClick={() => setCatalogDialogOpen(true)}>
            <PackageCheck className="mr-1 h-4 w-4" />
            编辑能力与方案
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <InfoCard label="产品类型" value={product.type || 'service'} />
          <InfoCard label="产品状态" value={product.status || 'active'} />
          <InfoCard label="内部档案" value={targetProfileCode || '待创建'} mono />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>销售与展示档案</CardTitle>
          <CardDescription>这里管理用户真正看到和购买到的产品入口。底层仍使用内部 app 记录承载，但后台不再把它作为主对象暴露。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>产品名称</Label>
              <Input value={form.name} onChange={(event) => setForm((current) => current ? { ...current, name: event.target.value } : current)} />
            </div>
            <div className="space-y-2">
              <Label>一句话简介</Label>
              <Input value={form.tagline} onChange={(event) => setForm((current) => current ? { ...current, tagline: event.target.value } : current)} />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>产品分类</Label>
              <Input value={form.category} onChange={(event) => setForm((current) => current ? { ...current, category: event.target.value } : current)} placeholder="如 commerce / content / automation" />
            </div>
            <div className="space-y-2">
              <Label>技术形态</Label>
              <Select value={form.type} onValueChange={(value) => setForm((current) => current ? { ...current, type: value as WorkspaceForm['type'] } : current)}>
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
              <Label>售卖状态</Label>
              <Select value={form.status} onValueChange={(value) => setForm((current) => current ? { ...current, status: value as WorkspaceForm['status'] } : current)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>图标 URL</Label>
              <Input value={form.iconUrl} onChange={(event) => setForm((current) => current ? { ...current, iconUrl: event.target.value } : current)} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>封面图 URL</Label>
              <Input value={form.coverUrl} onChange={(event) => setForm((current) => current ? { ...current, coverUrl: event.target.value } : current)} placeholder="https://..." />
            </div>
          </div>
          <div className="space-y-2">
            <Label>产品详情（Markdown）</Label>
            <Textarea
              className="min-h-[220px] font-mono text-sm"
              value={form.content}
              onChange={(event) => setForm((current) => current ? { ...current, content: event.target.value } : current)}
              placeholder="在这里维护对外展示的产品介绍。"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>授权方案展示</CardTitle>
            <CardDescription>Plan 是授权引擎里的真实售卖方案；这里决定对外如何展示、定价和默认购买入口。</CardDescription>
          </div>
          <Button variant="outline" onClick={addOffer} disabled={availablePlans.length === 0}>
            <Plus className="mr-1 h-4 w-4" />
            新增展示方案
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {availablePlans.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">
              先为这个产品创建至少一个授权方案，才能配置销售展示。
            </div>
          ) : editableOffers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">
              还没有自定义展示方案。保存后会自动回退到产品内的基础 Plan。
            </div>
          ) : (
            editableOffers.map((offer) => {
              const boundPlan = availablePlans.find((plan) => plan.code === offer.planCode) ?? null;

              return (
                <div key={offer.id} className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-foreground">{offer.title || '未命名展示方案'}</p>
                      <p className="text-xs text-muted-foreground">
                        绑定 Plan：{boundPlan ? `${boundPlan.name} (${formatPlanInterval(boundPlan.interval)})` : offer.planCode || '未选择'}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeOffer(offer.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>展示标题</Label>
                      <Input value={offer.title} onChange={(event) => updateOffer(offer.id, (current) => ({ ...current, title: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>展示 Code</Label>
                      <Input value={offer.code} onChange={(event) => updateOffer(offer.id, (current) => ({ ...current, code: slugify(event.target.value) }))} />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>绑定 Plan</Label>
                      <Select value={offer.planCode} onValueChange={(value) => updateOffer(offer.id, (current) => ({ ...current, planCode: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="选择授权方案" />
                        </SelectTrigger>
                        <SelectContent>
                          {availablePlans.map((plan) => (
                            <SelectItem key={plan.code} value={plan.code}>
                              {plan.name} ({formatPlanInterval(plan.interval)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>展示价格（元）</Label>
                      <Input value={offer.priceYuan} onChange={(event) => updateOffer(offer.id, (current) => ({ ...current, priceYuan: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>状态</Label>
                      <Select value={offer.status} onValueChange={(value) => updateOffer(offer.id, (current) => ({ ...current, status: value as EditableOffer['status'] }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>标签</Label>
                      <Input value={offer.badge} onChange={(event) => updateOffer(offer.id, (current) => ({ ...current, badge: event.target.value }))} placeholder="如 推荐 / 企业版" />
                    </div>
                    <div className="space-y-2">
                      <Label>默认购买入口</Label>
                      <div className="flex h-10 items-center gap-3 rounded-xl border border-input bg-background px-3">
                        <input type="radio" checked={offer.isDefault} onChange={() => markDefaultOffer(offer.id)} />
                        <span className="text-sm text-muted-foreground">将此方案作为默认展示与购买入口</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>说明</Label>
                    <Textarea value={offer.description} onChange={(event) => updateOffer(offer.id, (current) => ({ ...current, description: event.target.value }))} className="min-h-[96px]" />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>交付声明来源</CardTitle>
            <CardDescription>这里定义一键部署或远程安装的来源仓库。后台只谈产品，底层仍会写入内部产品档案的 delivery manifest。</CardDescription>
          </div>
          <Button
            variant="outline"
            disabled={syncManifestMutation.isPending || !deliverySource.repoUrl.trim() || !primaryApp || needsDedicatedProfile}
            onClick={() => syncManifestMutation.mutate()}
          >
            {syncManifestMutation.isPending ? '同步中...' : '同步交付声明'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>仓库 URL</Label>
              <Input value={deliverySource.repoUrl} onChange={(event) => setDeliverySource((current) => ({ ...current, repoUrl: event.target.value }))} placeholder="https://github.com/FutureDecade/fd-retail-system.git" />
            </div>
            <div className="space-y-2">
              <Label>仓库分支</Label>
              <Input value={deliverySource.repoBranch} onChange={(event) => setDeliverySource((current) => ({ ...current, repoBranch: event.target.value }))} placeholder="main" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Manifest Path</Label>
              <Input value={deliverySource.manifestPath} onChange={(event) => setDeliverySource((current) => ({ ...current, manifestPath: event.target.value }))} placeholder="fd-delivery.manifest.json" />
            </div>
            <div className="space-y-2">
              <Label>Manifest URL（可选）</Label>
              <Input value={deliverySource.manifestUrl} onChange={(event) => setDeliverySource((current) => ({ ...current, manifestUrl: event.target.value }))} placeholder="https://raw.githubusercontent.com/..." />
            </div>
          </div>
          <div className="rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
            {!primaryApp
              ? '请先保存产品档案。保存后系统会为当前产品创建或更新内部兼容档案，随后才能同步交付声明。'
              : needsDedicatedProfile
              ? `当前产品仍在复用共享内部档案 ${primaryApp.code}。请先保存一次产品档案，生成专属档案后再同步交付声明。`
              : hasDeliveryManifest
              ? `当前已同步交付声明，底层档案 code 为 ${targetProfileCode}。`
              : '当前尚未同步交付声明。先填写仓库 URL，再执行同步。'}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-4 w-4" />
              交付配置
            </CardTitle>
            <CardDescription>实例级域名、环境变量覆盖值和密钥配置入口。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              这里仍复用底层产品档案的交付配置机制，但入口已经转成按产品管理。
            </div>
            <Button asChild variant="outline" disabled={!primaryApp || needsDedicatedProfile}>
              <Link to={`/admin/delivery?productCode=${product.code}`}>
                <FileCog className="mr-1 h-4 w-4" />
                打开产品交付配置
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              接入密钥
            </CardTitle>
            <CardDescription>适用于 Chrome 扩展或其他需要主动对接中台 API 的产品。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              当前有效密钥：{activeSecrets}。密钥仍由底层产品档案承载，但后台入口已经按产品收拢。
            </div>
            <Button asChild variant="outline" disabled={!primaryApp || needsDedicatedProfile}>
              <Link to={`/admin/secrets?productCode=${product.code}`}>
                <PackageSearch className="mr-1 h-4 w-4" />
                打开产品接入密钥
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <CatalogBundleDialog
        open={catalogDialogOpen}
        onOpenChange={setCatalogDialogOpen}
        bundle={bundle}
        pending={catalogMutation.isPending}
        onSubmit={(payload) =>
          catalogMutation.mutate({
            nextProductCode: payload.productCode,
            values: {
              name: payload.name,
              type: payload.type,
              status: payload.status,
              features: payload.features,
              plans: payload.plans
            }
          })
        }
      />
    </div>
  );
}

function WorkspaceMetric({
  label,
  value,
  note,
  tone
}: {
  label: string;
  value: string;
  note: string;
  tone: 'ok' | 'warn' | 'neutral';
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-black tracking-tight text-foreground">{value}</p>
        <div className="mt-1 flex items-center gap-2">
          <StatusPill tone={tone} label={tone === 'ok' ? '已就绪' : tone === 'warn' ? '待补齐' : '概览'} />
          <span className="text-xs text-muted-foreground">{note}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-bold text-foreground ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
