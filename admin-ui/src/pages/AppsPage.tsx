import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  createAppSecret,
  listAppsAdmin,
  listCatalogSnapshot,
  revokeAppSecret,
  upsertCatalogBundle,
  upsertApp
} from '@/api/apps';
import type { AppWithDetails, FeatureSummary, PlanSummary } from '@/api/types';
import { CatalogBundleDialog, type CatalogBundleSummary } from '@/components/apps/CatalogBundleDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { formatTime } from '@/lib/utils';

const appSchema = z.object({
  name: z.string().min(1, '应用名称不能为空'),
  description: z.string().optional(),
  type: z.enum(['chrome_extension', 'web_app', 'service']),
  status: z.enum(['active', 'inactive', 'cancelled', 'expired']),
  productCodes: z.array(z.string()).min(1, '至少绑定一个产品')
});
type AppFormValues = z.infer<typeof appSchema>;

type EditableOffer = {
  id: string;
  code: string;
  planCode: string;
  title: string;
  description: string;
  badge: string;
  priceYuan: string;
  currency: string;
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
  isDefault: boolean;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function formatPriceYuan(priceAmount?: number) {
  return ((priceAmount ?? 0) / 100).toFixed(2);
}

function formatPlanInterval(interval: string | null | undefined) {
  if (interval === 'month') return '月付';
  if (interval === 'year') return '年付';
  if (interval === 'one_time') return '一次性';
  return interval || '未设置';
}

function createOfferId() {
  return `offer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyOffer(plan?: PlanSummary): EditableOffer {
  return {
    id: createOfferId(),
    code: slugify(plan?.code || `offer_${Date.now().toString(36)}`),
    planCode: plan?.code || '',
    title: plan?.name || '',
    description: '',
    badge: '',
    priceYuan: formatPriceYuan(plan?.priceAmount),
    currency: plan?.currency || 'CNY',
    status: (plan?.status as EditableOffer['status']) || 'active',
    isDefault: false
  };
}

function offersFromApp(app: AppWithDetails | null): EditableOffer[] {
  return (app?.checkoutOffers ?? []).map((offer) => ({
    id: createOfferId(),
    code: offer.code,
    planCode: offer.planCode,
    title: offer.title,
    description: offer.description || '',
    badge: offer.badge || '',
    priceYuan: formatPriceYuan(offer.priceAmount),
    currency: offer.currency,
    status: offer.status as EditableOffer['status'],
    isDefault: offer.isDefault
  }));
}

export function AppsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'catalog' | 'apps' | 'secrets'>('catalog');
  const [selectedApp, setSelectedApp] = useState<AppWithDetails | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [editableOffers, setEditableOffers] = useState<EditableOffer[]>([]);
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [selectedBundle, setSelectedBundle] = useState<CatalogBundleSummary | null>(null);
  const [secretResult, setSecretResult] = useState<{ secret: string; secretId: string; appCode: string } | null>(null);
  const [secretVisible, setSecretVisible] = useState(false);
  const [secretAppCode, setSecretAppCode] = useState('');
  const [secretExpiresAt, setSecretExpiresAt] = useState('');

  const { data: appsData, isLoading: isAppsLoading } = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const { data: catalogData, isLoading: isCatalogLoading } = useQuery({
    queryKey: ['catalog'],
    queryFn: listCatalogSnapshot
  });

  const apps = appsData?.items ?? [];
  const products = catalogData?.products ?? [];
  const features = catalogData?.features ?? [];
  const planFeatures = catalogData?.planFeatures ?? [];
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const allPlans = useMemo(
    () =>
      (catalogData?.plans ?? []).map((plan) => {
        const product = plan.productId ? productMap.get(plan.productId) : null;
        return {
          ...plan,
          productCode: plan.productCode || product?.code,
          productName: plan.productName || product?.name
        };
      }),
    [catalogData?.plans, productMap]
  );
  const featureMap = useMemo(() => new Map(features.map((feature) => [feature.id, feature])), [features]);
  const planFeatureCodesByPlanId = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const mapping of planFeatures) {
      const feature = featureMap.get(mapping.featureId);
      if (!feature) continue;
      if (!grouped.has(mapping.planId)) {
        grouped.set(mapping.planId, []);
      }
      grouped.get(mapping.planId)?.push(feature.code);
    }
    return grouped;
  }, [featureMap, planFeatures]);
  const catalogBundles = useMemo<CatalogBundleSummary[]>(() => {
    const featuresByProduct = new Map<string, FeatureSummary[]>();
    for (const feature of features) {
      if (!feature.productId) continue;
      if (!featuresByProduct.has(feature.productId)) {
        featuresByProduct.set(feature.productId, []);
      }
      featuresByProduct.get(feature.productId)?.push(feature);
    }

    const plansByProduct = new Map<string, PlanSummary[]>();
    for (const plan of allPlans) {
      if (!plan.productId) continue;
      if (!plansByProduct.has(plan.productId)) {
        plansByProduct.set(plan.productId, []);
      }
      plansByProduct.get(plan.productId)?.push(plan);
    }

    return products.map((product) => {
      const productPlans = plansByProduct.get(product.id) ?? [];
      return {
        product,
        features: featuresByProduct.get(product.id) ?? [],
        plans: productPlans,
        planFeatureCodesByPlanCode: Object.fromEntries(
          productPlans.map((plan) => [plan.code, planFeatureCodesByPlanId.get(plan.id) ?? []])
        )
      };
    });
  }, [allPlans, features, planFeatureCodesByPlanId, products]);

  const appForm = useForm<AppFormValues>({
    resolver: zodResolver(appSchema),
    defaultValues: { name: '', description: '', type: 'web_app', status: 'active', productCodes: [] }
  });

  const selectedProductCodes = appForm.watch('productCodes');
  const availablePlans = useMemo(
    () =>
      allPlans
        .filter((plan) => plan.productCode && selectedProductCodes.includes(plan.productCode))
        .sort((left, right) => (left.productCode || '').localeCompare(right.productCode || '') || left.code.localeCompare(right.code)),
    [allPlans, selectedProductCodes]
  );
  const availablePlanMap = useMemo(() => new Map(availablePlans.map((plan) => [plan.code, plan])), [availablePlans]);

  const upsertMutation = useMutation({
    mutationFn: ({ code, values }: { code: string; values: AppFormValues }) => {
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

      const defaultOfferCode =
        checkoutOffers.find((offer) => offer.isDefault)?.code ||
        checkoutOffers[0]?.code ||
        undefined;
      const meta = { ...(selectedApp?.meta ?? {}) };
      delete meta.checkoutPlanCode;
      delete meta.checkoutOffers;
      delete meta.checkoutDefaultOfferCode;

      return upsertApp(code, {
        ...values,
        checkoutOffers,
        checkoutDefaultOfferCode: defaultOfferCode,
        meta
      });
    },
    onSuccess: () => {
      toast.success('应用配置已保存');
      void qc.invalidateQueries({ queryKey: ['apps'] });
      setSelectedApp(null);
      setIsNew(false);
      setEditableOffers([]);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败')
  });

  const catalogMutation = useMutation({
    mutationFn: ({
      productCode,
      values
    }: {
      productCode: string;
      values: Parameters<typeof upsertCatalogBundle>[1];
    }) => upsertCatalogBundle(productCode, values),
    onSuccess: () => {
      toast.success('产品目录已保存');
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      void qc.invalidateQueries({ queryKey: ['apps'] });
      setCatalogDialogOpen(false);
      setSelectedBundle(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存目录失败')
  });

  const secretMutation = useMutation({
    mutationFn: ({ appCode, expiresAt }: { appCode: string; expiresAt?: string }) =>
      createAppSecret(appCode, expiresAt || undefined),
    onSuccess: (result) => {
      toast.success('App Secret 已生成，请立即保存');
      setSecretResult({ secret: result.secret, secretId: result.secretId, appCode: result.appCode });
      setSecretAppCode('');
      setSecretExpiresAt('');
      void qc.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '生成失败')
  });

  const revokeMutation = useMutation({
    mutationFn: ({ appCode, secretId }: { appCode: string; secretId: string }) => revokeAppSecret(appCode, secretId),
    onSuccess: () => {
      toast.success('Secret 已撤销');
      void qc.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '撤销失败')
  });

  const openEdit = (app: AppWithDetails) => {
    setIsNew(false);
    setSelectedApp(app);
    setEditableOffers(offersFromApp(app));
    appForm.reset({
      name: app.name,
      description: app.description ?? '',
      type: app.type as AppFormValues['type'],
      status: app.status as AppFormValues['status'],
      productCodes: app.products?.map((product) => product.code) ?? []
    });
  };

  const openNew = () => {
    setIsNew(true);
    setSelectedApp(null);
    setEditableOffers([]);
    appForm.reset({ name: '', description: '', type: 'web_app', status: 'active', productCodes: [] });
  };

  const openCatalogCreate = () => {
    setSelectedBundle(null);
    setCatalogDialogOpen(true);
  };

  const openCatalogEdit = (bundle: CatalogBundleSummary) => {
    setSelectedBundle(bundle);
    setCatalogDialogOpen(true);
  };

  const updateOffer = (offerId: string, updater: (current: EditableOffer) => EditableOffer) => {
    setEditableOffers((current) => current.map((offer) => (offer.id === offerId ? updater(offer) : offer)));
  };

  const markDefaultOffer = (offerId: string) => {
    setEditableOffers((current) =>
      current.map((offer) => ({
        ...offer,
        isDefault: offer.id === offerId
      }))
    );
  };

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

  const appColumns: Column<AppWithDetails>[] = [
    {
      key: 'name',
      header: '应用',
      cell: (row) => (
        <div>
          <p className="text-sm font-bold">{row.name}</p>
          <p className="text-xs text-muted-foreground font-mono">{row.code}</p>
          {row.description && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{row.description}</p>}
        </div>
      )
    },
    {
      key: 'status',
      header: '类型/状态',
      cell: (row) => (
        <div className="flex flex-col gap-1.5">
          <StatusPill tone="neutral" label={row.type} />
          <StatusPill tone={statusToTone(row.status)} label={row.status} />
        </div>
      )
    },
    {
      key: 'offers',
      header: '产品 / 定价梯度',
      cell: (row) => (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {row.products?.map((product) => (
              <span key={product.code} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 font-mono">
                {product.code}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {row.checkoutOffers?.map((offer) => (
              <span
                key={offer.code}
                className={`text-xs rounded px-1.5 py-0.5 font-mono border ${
                  offer.isDefault
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                }`}
              >
                {offer.title} ¥{formatPriceYuan(offer.priceAmount)}/{formatPlanInterval(offer.interval)}
              </span>
            ))}
            {(!row.checkoutOffers || row.checkoutOffers.length === 0) && (
              <span className="text-xs text-muted-foreground">未配置自定义 offer，前端将回退到基础 plan</span>
            )}
          </div>
        </div>
      )
    },
    {
      key: 'secrets',
      header: 'Secrets',
      cell: (row) => {
        const active = row.secrets?.filter((secret) => !secret.expiresAt || new Date(secret.expiresAt) > new Date()).length ?? 0;
        return <span className="text-xs text-muted-foreground">{active} 个有效</span>;
      }
    },
    {
      key: 'actions',
      header: '操作',
      cell: (row) => (
        <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); openEdit(row); }}>
          编辑
        </Button>
      )
    }
  ];

  const catalogColumns: Column<CatalogBundleSummary>[] = [
    {
      key: 'product',
      header: '产品目录',
      cell: (row) => (
        <div>
          <p className="text-sm font-bold">{row.product.name}</p>
          <p className="text-xs text-muted-foreground font-mono">{row.product.code}</p>
        </div>
      )
    },
    {
      key: 'status',
      header: '类型/状态',
      cell: (row) => (
        <div className="flex flex-col gap-1.5">
          <StatusPill tone="neutral" label={row.product.type || 'service'} />
          <StatusPill tone={statusToTone(row.product.status || 'inactive')} label={row.product.status || 'inactive'} />
        </div>
      )
    },
    {
      key: 'features',
      header: '功能项',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.features.map((feature) => (
            <span key={feature.code} className="rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-xs font-mono text-blue-700">
              {feature.code}
            </span>
          ))}
          {row.features.length === 0 && <span className="text-xs text-muted-foreground">未配置</span>}
        </div>
      )
    },
    {
      key: 'plans',
      header: 'Plans',
      cell: (row) => (
        <div className="space-y-1">
          {row.plans.map((plan) => (
            <div key={plan.code} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{plan.name}</span>
              <span className="ml-2 font-mono">{plan.code}</span>
              <span className="ml-2">
                ¥{formatPriceYuan(plan.priceAmount)}/{formatPlanInterval(plan.interval)}
              </span>
            </div>
          ))}
          {row.plans.length === 0 && <span className="text-xs text-muted-foreground">未配置</span>}
        </div>
      )
    },
    {
      key: 'actions',
      header: '操作',
      cell: (row) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            openCatalogEdit(row);
          }}
        >
          编辑目录
        </Button>
      )
    }
  ];

  const editingCode = isNew ? '' : selectedApp?.code ?? '';

  return (
    <div>
      <SectionHeader sectionKey="apps" />
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'catalog' | 'apps' | 'secrets')}>
          <div className="mb-4 flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="catalog">产品目录</TabsTrigger>
              <TabsTrigger value="apps">应用列表</TabsTrigger>
              <TabsTrigger value="secrets">Secret 管理</TabsTrigger>
            </TabsList>
            {activeTab === 'catalog' ? (
              <Button size="sm" onClick={openCatalogCreate}>
                <Plus className="mr-1 h-4 w-4" />
                新建产品目录
              </Button>
            ) : activeTab === 'apps' ? (
              <Button size="sm" onClick={openNew}>
                <Plus className="mr-1 h-4 w-4" />
                新建应用
              </Button>
            ) : null}
          </div>

          <TabsContent value="catalog">
            <div className="overflow-hidden rounded-2xl border border-border bg-white">
              <DataTable
                columns={catalogColumns}
                data={catalogBundles}
                isLoading={isCatalogLoading}
                emptyMessage="暂无产品目录"
                getRowKey={(row) => row.product.id}
              />
            </div>
          </TabsContent>

          <TabsContent value="apps">
            <div className="overflow-hidden rounded-2xl border border-border bg-white">
              <DataTable
                columns={appColumns}
                data={apps}
                isLoading={isAppsLoading}
                emptyMessage="暂无应用"
                getRowKey={(row) => row.id}
              />
            </div>
          </TabsContent>

          <TabsContent value="secrets">
            <div className="max-w-xl space-y-6">
              <div className="rounded-2xl border border-border bg-white p-5">
                <h3 className="mb-4 text-sm font-black">生成 App Secret</h3>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-bold">选择应用</label>
                    <Select value={secretAppCode} onValueChange={setSecretAppCode}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择应用..." />
                      </SelectTrigger>
                      <SelectContent>
                        {apps.map((app) => (
                          <SelectItem key={app.code} value={app.code}>
                            {app.name} ({app.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-bold">过期时间（留空永不过期）</label>
                    <Input type="datetime-local" value={secretExpiresAt} onChange={(event) => setSecretExpiresAt(event.target.value)} />
                  </div>
                  <Button
                    disabled={!secretAppCode || secretMutation.isPending}
                    onClick={() =>
                      secretMutation.mutate({
                        appCode: secretAppCode,
                        expiresAt: secretExpiresAt ? new Date(secretExpiresAt).toISOString() : undefined
                      })
                    }
                  >
                    {secretMutation.isPending ? '生成中...' : '一键生成 Secret'}
                  </Button>
                </div>
              </div>

              {apps.filter((app) => (app.secrets?.length ?? 0) > 0).map((app) => (
                <div key={app.code} className="overflow-hidden rounded-2xl border border-border bg-white">
                  <div className="border-b border-border bg-muted/30 px-4 py-3">
                    <p className="text-sm font-black">{app.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">{app.code}</p>
                  </div>
                  {app.secrets?.map((secret) => (
                    <div key={secret.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-foreground">{secret.hint}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(secret.expiresAt)}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => {
                          if (confirm(`确认撤销 Secret ${secret.hint}？`)) {
                            revokeMutation.mutate({ appCode: app.code, secretId: secret.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <CatalogBundleDialog
        open={catalogDialogOpen}
        onOpenChange={(open) => {
          setCatalogDialogOpen(open);
          if (!open) {
            setSelectedBundle(null);
          }
        }}
        bundle={selectedBundle}
        pending={catalogMutation.isPending}
        onSubmit={(payload) =>
          catalogMutation.mutate({
            productCode: payload.productCode,
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

      <Dialog
        open={isNew || !!selectedApp}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedApp(null);
            setIsNew(false);
            setEditableOffers([]);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? '新建应用' : `编辑 ${selectedApp?.name}`}</DialogTitle>
            <DialogDescription>{isNew ? '创建新的接入应用' : `应用标识: ${selectedApp?.code}`}</DialogDescription>
          </DialogHeader>

          <Form {...appForm}>
            <form
              onSubmit={appForm.handleSubmit((values) => {
                const code = isNew ? slugify(values.name) : editingCode;
                upsertMutation.mutate({ code, values });
              })}
              className="space-y-5"
            >
              <FormField
                control={appForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>应用名称</FormLabel>
                    <FormControl>
                      <Input placeholder="My App" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={appForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>类型</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="chrome_extension">Chrome Extension</SelectItem>
                          <SelectItem value="web_app">Web App</SelectItem>
                          <SelectItem value="service">Service</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={appForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>状态</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={appForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>描述（可选）</FormLabel>
                    <FormControl>
                      <Input placeholder="应用简介" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {products.length > 0 && (
                <FormField
                  control={appForm.control}
                  name="productCodes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>绑定产品</FormLabel>
                      <div className="space-y-2">
                        {products.map((product) => (
                          <label key={product.code} className="flex cursor-pointer items-center gap-2">
                            <Checkbox
                              checked={field.value.includes(product.code)}
                              onCheckedChange={(checked) => {
                                const next = checked
                                  ? [...field.value, product.code]
                                  : field.value.filter((code) => code !== product.code);
                                field.onChange(next);
                              }}
                            />
                            <span className="text-sm font-mono">{product.code}</span>
                            <span className="text-xs text-muted-foreground">{product.name}</span>
                          </label>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black">应用定价梯度</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      这里管理该应用对外展示的全部订阅价格选项。每个 offer 绑定一个基础 plan，但价格、标题、标签都可以按应用单独设置。
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={addOffer} disabled={availablePlans.length === 0}>
                    <Plus className="mr-1 h-4 w-4" />
                    添加 Offer
                  </Button>
                </div>

                {availablePlans.length === 0 ? (
                  <p className="text-xs text-muted-foreground">先选择产品，才能配置该应用的价格选项。</p>
                ) : editableOffers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-white/70 p-4 text-xs text-muted-foreground">
                    当前还没有配置应用级 offer。保存后，前端会回退到基础 plan；如果你要自定义价格梯度，请先点“添加 Offer”。
                  </div>
                ) : (
                  <div className="space-y-4">
                    {editableOffers.map((offer, index) => {
                      const boundPlan = availablePlanMap.get(offer.planCode) ?? allPlans.find((plan) => plan.code === offer.planCode) ?? null;
                      return (
                        <div key={offer.id} className="space-y-3 rounded-xl border border-border bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-black">{offer.title || `Offer ${index + 1}`}</p>
                              <p className="text-xs font-mono text-muted-foreground">
                                {offer.code || '未设置 code'} · 绑定 {offer.planCode || '未选择 plan'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {offer.isDefault && <StatusPill tone="warn" label="default" />}
                              <StatusPill tone={statusToTone(offer.status)} label={offer.status} />
                              <Button type="button" size="icon" variant="ghost" onClick={() => removeOffer(offer.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="mb-1.5 block text-xs font-bold">Offer Code</label>
                              <Input
                                value={offer.code}
                                onChange={(event) => updateOffer(offer.id, (current) => ({ ...current, code: slugify(event.target.value) }))}
                                placeholder="translator_monthly_launch"
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-xs font-bold">绑定基础 Plan</label>
                              <Select
                                value={offer.planCode}
                                onValueChange={(value) =>
                                  updateOffer(offer.id, (current) => {
                                    const nextPlan = availablePlanMap.get(value);
                                    return {
                                      ...current,
                                      planCode: value,
                                      currency: nextPlan?.currency || current.currency,
                                      status: (nextPlan?.status as EditableOffer['status']) || current.status,
                                      title: current.title || nextPlan?.name || '',
                                      priceYuan: current.priceYuan || formatPriceYuan(nextPlan?.priceAmount)
                                    };
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="选择 plan" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availablePlans.map((plan) => (
                                    <SelectItem key={plan.code} value={plan.code}>
                                      {plan.name} ({plan.code}) · {formatPlanInterval(plan.interval)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="mb-1.5 block text-xs font-bold">展示标题</label>
                              <Input
                                value={offer.title}
                                onChange={(event) => updateOffer(offer.id, (current) => ({ ...current, title: event.target.value }))}
                                placeholder="Pro 月付"
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-xs font-bold">标签（可选）</label>
                              <Input
                                value={offer.badge}
                                onChange={(event) => updateOffer(offer.id, (current) => ({ ...current, badge: event.target.value }))}
                                placeholder="限时优惠"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="mb-1.5 block text-xs font-bold">描述（可选）</label>
                            <Input
                              value={offer.description}
                              onChange={(event) => updateOffer(offer.id, (current) => ({ ...current, description: event.target.value }))}
                              placeholder={boundPlan ? `${formatPlanInterval(boundPlan.interval)} · 绑定 ${boundPlan.productCode}` : '用于前端展示的简短说明'}
                            />
                          </div>

                          <div className="grid grid-cols-4 gap-3">
                            <div>
                              <label className="mb-1.5 block text-xs font-bold">价格（元）</label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={offer.priceYuan}
                                onChange={(event) => updateOffer(offer.id, (current) => ({ ...current, priceYuan: event.target.value }))}
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-xs font-bold">币种</label>
                              <Input
                                value={offer.currency}
                                onChange={(event) => updateOffer(offer.id, (current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-xs font-bold">状态</label>
                              <Select
                                value={offer.status}
                                onValueChange={(value) => updateOffer(offer.id, (current) => ({ ...current, status: value as EditableOffer['status'] }))}
                              >
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
                            <div className="flex items-end">
                              <Button type="button" variant={offer.isDefault ? 'default' : 'outline'} className="w-full" onClick={() => markDefaultOffer(offer.id)}>
                                {offer.isDefault ? '默认 Offer' : '设为默认'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? '保存中...' : '保存应用'}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!secretResult} onOpenChange={(open) => { if (!open) setSecretResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Secret 已生成 ⚠️</DialogTitle>
            <DialogDescription>此 Secret 只显示一次，请立即复制保存。关闭后将无法再次查看。</DialogDescription>
          </DialogHeader>
          {secretResult && (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
                <p className="mb-1 font-black text-amber-800">appCode: {secretResult.appCode}</p>
                <p className="mb-1 font-black text-amber-800">secretId: {secretResult.secretId}</p>
              </div>
              <div className="relative">
                <div className="break-all rounded-xl bg-slate-950 p-3 pr-16 font-mono text-xs text-green-400">
                  {secretVisible ? secretResult.secret : '•'.repeat(Math.min(secretResult.secret.length, 40))}
                </div>
                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => setSecretVisible((value) => !value)}>
                    {secretVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-slate-400 hover:text-white"
                    onClick={() => {
                      void navigator.clipboard.writeText(secretResult.secret);
                      toast.success('已复制到剪贴板');
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
