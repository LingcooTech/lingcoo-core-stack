import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { listAppsAdmin } from '@/api/apps';
import { upsertProductBasic } from '@/api/admin';
import type { AuthorizationTemplateSummary, PriceSummary } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useCatalogData } from '@/hooks/useCatalogData';
import { formatPlanInterval, formatPriceYuan } from '@/lib/catalog-utils';
import { getLinkedAppsForProduct } from '@/lib/product-model';
import { formatTime } from '@/lib/utils';

type ProductFormState = {
  code: string;
  name: string;
  type: 'chrome_extension' | 'web_app' | 'service';
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
  deliveryMode: 'direct_access' | 'one_click_deploy';
  tagline: string;
  category: string;
  iconUrl: string;
  coverUrl: string;
  description: string;
  content: string;
};

function normalizeCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function createEmptyForm(): ProductFormState {
  return {
    code: '',
    name: '',
    type: 'service',
    status: 'active',
    deliveryMode: 'direct_access',
    tagline: '',
    category: '',
    iconUrl: '',
    coverUrl: '',
    description: '',
    content: ''
  };
}

export function ProductDetailPage() {
  const { productCode } = useParams<{ productCode?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isCreateMode = !productCode || productCode === 'new';

  const { catalogBundles, isLoading } = useCatalogData();
  const appsQuery = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const apps = appsQuery.data?.items ?? [];

  const bundle = useMemo(
    () => (isCreateMode ? null : catalogBundles.find((item) => item.product.code === productCode) ?? null),
    [catalogBundles, isCreateMode, productCode]
  );
  const product = bundle?.product ?? null;
  const linkedApps = useMemo(
    () => (product ? getLinkedAppsForProduct(product.code, apps) : []),
    [apps, product]
  );

  const [form, setForm] = useState<ProductFormState>(createEmptyForm());
  const [initializedCode, setInitializedCode] = useState<string | null>(null);

  useEffect(() => {
    const targetCode = isCreateMode ? '__new__' : (product?.code ?? null);
    if (!targetCode || initializedCode === targetCode) {
      return;
    }

    setForm(
      product
        ? {
            code: product.code,
            name: product.name,
            type: (product.type as ProductFormState['type']) || 'service',
            status: (product.status as ProductFormState['status']) || 'active',
            deliveryMode: (product.deliveryMode as ProductFormState['deliveryMode']) || 'direct_access',
            tagline: product.tagline || '',
            category: product.category || '',
            iconUrl: product.iconUrl || '',
            coverUrl: product.coverUrl || '',
            description: product.description || '',
            content: product.content || ''
          }
        : createEmptyForm()
    );
    setInitializedCode(targetCode);
  }, [initializedCode, isCreateMode, product]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const code = normalizeCode(form.code);
      if (!code) {
        throw new Error('请先填写产品标识');
      }
      if (!form.name.trim()) {
        throw new Error('请先填写产品名称');
      }

      return upsertProductBasic(code, {
        name: form.name.trim(),
        type: form.type,
        status: form.status,
        deliveryMode: form.deliveryMode,
        tagline: form.tagline.trim() || undefined,
        category: form.category.trim() || undefined,
        iconUrl: form.iconUrl.trim() || undefined,
        coverUrl: form.coverUrl.trim() || undefined,
        description: form.description.trim() || undefined,
        content: form.content.trim() || undefined
      });
    },
    onSuccess: async () => {
      toast.success(isCreateMode ? '产品已创建' : '产品基本信息已保存');
      await qc.invalidateQueries({ queryKey: ['catalog'] });
      if (isCreateMode) {
        navigate(`/admin/products/${normalizeCode(form.code)}`, { replace: true });
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '保存失败')
  });

  const pricingColumns: Column<PriceSummary>[] = [
    {
      key: 'price',
      header: '价格方案',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">{row.name}</p>
          <p className="text-xs font-mono text-muted-foreground">{row.code}</p>
        </div>
      )
    },
    {
      key: 'billing',
      header: '收费方式',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-xs font-bold text-foreground">{formatPlanInterval(row.interval)}</p>
          <p className="text-xs text-muted-foreground">{row.currency || 'CNY'}</p>
        </div>
      )
    },
    {
      key: 'amount',
      header: '金额',
      cell: (row) => (
        <p className="text-xs font-bold text-foreground">
          ¥{formatPriceYuan(row.priceAmount)}
        </p>
      )
    },
    {
      key: 'authorization',
      header: '关联授权',
      cell: (row) => (
        <p className="text-xs text-muted-foreground">
          {(bundle?.priceAuthorizationCodesByPriceCode[row.code] ?? []).length} 个授权映射
        </p>
      )
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => (
        <StatusPill tone={statusToTone(row.status || 'inactive')} label={row.status || 'inactive'} />
      )
    }
  ];

  const authorizationColumns: Column<AuthorizationTemplateSummary>[] = [
    {
      key: 'template',
      header: '授权档位',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">{row.name}</p>
          <p className="text-xs font-mono text-muted-foreground">{row.code}</p>
        </div>
      )
    },
    {
      key: 'kind',
      header: '类型',
      cell: (row) => <StatusPill tone="neutral" label={row.kind} />
    },
    {
      key: 'prices',
      header: '价格映射',
      cell: (row) => {
        const usedCount = (bundle?.prices ?? []).filter((price) =>
          (bundle?.priceAuthorizationCodesByPriceCode[price.code] ?? []).includes(row.code)
        ).length;
        return <p className="text-xs text-muted-foreground">{usedCount} 个价格方案使用</p>;
      }
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => <StatusPill tone={statusToTone(row.status || 'inactive')} label={row.status || 'inactive'} />
    }
  ];

  return (
    <div>
      <SectionHeader sectionKey="products" />
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" asChild>
              <Link to="/admin/products">
                <ArrowLeft className="mr-1 h-4 w-4" />
                返回产品列表
              </Link>
            </Button>
            <div>
              <h2 className="text-[28px] font-black tracking-tight text-slate-900">
                {isCreateMode ? '新建产品' : form.name || product?.name || form.code}
              </h2>
            </div>
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="mr-1 h-4 w-4" />
            {saveMutation.isPending ? '保存中...' : '保存产品'}
          </Button>
        </div>

        {!isCreateMode && product ? (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle>价格方案</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-black text-foreground">{bundle?.prices.length ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">当前产品的收费方案数量。</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>授权档位</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-black text-foreground">{bundle?.authorizationTemplates.length ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">当前承接中的授权档位数量。</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>售卖应用</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-black text-foreground">{linkedApps.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">可售卖这个产品的应用数量。</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>最近更新</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-bold text-foreground">{formatTime(product.updatedAt || product.createdAt)}</p>
                <p className="mt-1 text-xs text-muted-foreground">产品档案最后更新时间。</p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        <Tabs defaultValue="basic" className="space-y-6">
          <TabsList className="flex h-auto flex-wrap gap-2 rounded-2xl bg-transparent p-0">
            <TabsTrigger value="basic">基本信息</TabsTrigger>
            <TabsTrigger value="presentation">销售展示</TabsTrigger>
            <TabsTrigger value="pricing">价格方案</TabsTrigger>
            <TabsTrigger value="authorization">授权档位</TabsTrigger>
            <TabsTrigger value="applications">售卖应用</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>产品基本信息</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>产品标识</Label>
                  <Input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} disabled={!isCreateMode} placeholder="product_code" />
                </div>
                <div className="space-y-2">
                  <Label>产品名称</Label>
                  <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="产品名称" />
                </div>
                <div className="space-y-2">
                  <Label>产品类型</Label>
                  <Select value={form.type} onValueChange={(value) => setForm((current) => ({ ...current, type: value as ProductFormState['type'] }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chrome_extension">chrome_extension</SelectItem>
                      <SelectItem value="web_app">web_app</SelectItem>
                      <SelectItem value="service">service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>状态</Label>
                  <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as ProductFormState['status'] }))}>
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
                <div className="space-y-2 md:col-span-2">
                  <Label>交付模式</Label>
                  <Select value={form.deliveryMode} onValueChange={(value) => setForm((current) => ({ ...current, deliveryMode: value as ProductFormState['deliveryMode'] }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct_access">direct_access</SelectItem>
                      <SelectItem value="one_click_deploy">one_click_deploy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="presentation" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>销售展示</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>一句话卖点</Label>
                  <Input value={form.tagline} onChange={(event) => setForm((current) => ({ ...current, tagline: event.target.value }))} placeholder="一句话描述产品价值" />
                </div>
                <div className="space-y-2">
                  <Label>分类</Label>
                  <Input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="效率工具 / AI 助手" />
                </div>
                <div className="space-y-2">
                  <Label>图标 URL</Label>
                  <Input value={form.iconUrl} onChange={(event) => setForm((current) => ({ ...current, iconUrl: event.target.value }))} placeholder="https://..." />
                </div>
                <div className="space-y-2">
                  <Label>封面 URL</Label>
                  <Input value={form.coverUrl} onChange={(event) => setForm((current) => ({ ...current, coverUrl: event.target.value }))} placeholder="https://..." />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>简介</Label>
                  <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="min-h-[120px]" placeholder="用于商品列表和详情首屏的简介文案。" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>详细介绍</Label>
                  <Textarea value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} className="min-h-[180px]" placeholder="用于商品详情页的完整介绍内容。" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>价格方案</CardTitle>
                  </div>
                  <Button variant="outline" asChild>
                    <Link to="/admin/pricing">去价格方案页</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {bundle ? (
                  <div className="overflow-hidden rounded-2xl border border-border bg-white">
                    <DataTable
                      columns={pricingColumns}
                      data={bundle.prices}
                      isLoading={isLoading}
                      emptyMessage="暂无价格方案"
                      getRowKey={(row) => row.id}
                    />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="authorization" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>授权档位</CardTitle>
                  </div>
                  <Button variant="outline" asChild>
                    <Link to="/admin/authorization-templates">去授权档位页</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {bundle ? (
                  <div className="overflow-hidden rounded-2xl border border-border bg-white">
                    <DataTable
                      columns={authorizationColumns}
                      data={bundle.authorizationTemplates}
                      isLoading={isLoading}
                      emptyMessage="暂无授权档位"
                      getRowKey={(row) => row.id}
                    />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="applications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>售卖应用</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {linkedApps.map((appItem) => (
                  <div key={appItem.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-black text-foreground">{appItem.name}</p>
                      <p className="text-xs font-mono text-muted-foreground">{appItem.code}</p>
                      <p className="text-xs text-muted-foreground">{appItem.tagline || appItem.description || '暂无描述'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill tone="neutral" label={appItem.type} />
                      <StatusPill tone={statusToTone(appItem.status)} label={appItem.status} />
                      <Button variant="outline" asChild>
                        <Link to={`/admin/applications/${appItem.code}`}>查看应用</Link>
                      </Button>
                    </div>
                  </div>
                ))}
                {!appsQuery.isLoading && linkedApps.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center text-sm text-muted-foreground">
                    当前没有应用绑定这个产品，请先去应用详情中配置可售产品。
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
