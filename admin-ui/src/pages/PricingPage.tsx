import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';

import { upsertPrice } from '@/api/admin';
import type { PriceSummary } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCatalogData } from '@/hooks/useCatalogData';
import { formatPlanInterval, formatPriceYuan } from '@/lib/catalog-utils';

type PricingFormState = {
  code: string;
  productCode: string;
  name: string;
  billingPriceId: string;
  priceAmount: string;
  currency: string;
  interval: 'month' | 'year' | 'one_time';
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
  authorizationCode: string;
};

function normalizeCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function createEmptyPricingForm(): PricingFormState {
  return {
    code: '',
    productCode: '',
    name: '',
    billingPriceId: '',
    priceAmount: '0',
    currency: 'CNY',
    interval: 'month',
    status: 'active',
    authorizationCode: ''
  };
}

export function PricingPage() {
  const qc = useQueryClient();
  const { products, authorizationTemplates, allPrices, priceAuthorizationCodesByPriceId, isLoading } = useCatalogData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPrice, setEditingPrice] = useState<PriceSummary | null>(null);
  const [form, setForm] = useState<PricingFormState>(createEmptyPricingForm());

  const availableAuthorizationTemplates = useMemo(
    () =>
      authorizationTemplates.filter(
        (authorizationTemplate) =>
          !form.productCode || products.find((product) => product.id === authorizationTemplate.productId)?.code === form.productCode
      ),
    [authorizationTemplates, form.productCode, products]
  );
  const authorizationTemplateLabelByCode = useMemo(
    () => new Map(authorizationTemplates.map((item) => [item.code, item.name])),
    [authorizationTemplates]
  );

  useEffect(() => {
    if (!form.authorizationCode) {
      return;
    }

    if (!availableAuthorizationTemplates.some((item) => item.code === form.authorizationCode)) {
      setForm((current) => ({ ...current, authorizationCode: '' }));
    }
  }, [availableAuthorizationTemplates, form.authorizationCode]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const priceCode = normalizeCode(form.code);
      if (!priceCode) {
        throw new Error('请先填写方案标识');
      }
      if (!form.productCode) {
        throw new Error('请先选择所属产品');
      }
      if (!form.name.trim()) {
        throw new Error('请先填写方案名称');
      }

      const parsedAmount = Number(form.priceAmount);
      if (!Number.isInteger(parsedAmount) || parsedAmount < 0) {
        throw new Error('金额必须是大于等于 0 的整数，单位为分');
      }
      if (!form.authorizationCode) {
        throw new Error('请先选择对应的授权档位');
      }

      return upsertPrice(priceCode, {
        productCode: form.productCode,
        name: form.name.trim(),
        billingPriceId: form.billingPriceId.trim() || undefined,
        priceAmount: parsedAmount,
        currency: form.currency.trim().toUpperCase() || 'CNY',
        interval: form.interval,
        status: form.status,
        authorizationCodes: [form.authorizationCode]
      });
    },
    onSuccess: async () => {
      toast.success(editingPrice ? '价格方案已保存' : '价格方案已创建');
      await qc.invalidateQueries({ queryKey: ['catalog'] });
      setDialogOpen(false);
      setEditingPrice(null);
      setForm(createEmptyPricingForm());
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '保存失败')
  });

  function openCreateDialog() {
    setEditingPrice(null);
    setForm(createEmptyPricingForm());
    setDialogOpen(true);
  }

  function openEditDialog(price: PriceSummary) {
    setEditingPrice(price);
    setForm({
      code: price.code,
      productCode: price.productCode || '',
      name: price.name,
      billingPriceId: '',
      priceAmount: String(price.priceAmount ?? 0),
      currency: price.currency || 'CNY',
      interval: (price.interval as PricingFormState['interval']) || 'one_time',
      status: (price.status as PricingFormState['status']) || 'active',
      authorizationCode: priceAuthorizationCodesByPriceId.get(price.id)?.[0] ?? ''
    });
    setDialogOpen(true);
  }

  function selectAuthorizationTemplate(code: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      authorizationCode: checked ? code : ''
    }));
  }

  const columns: Column<PriceSummary>[] = [
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
      key: 'product',
      header: '所属产品',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">{row.productName || '未绑定产品'}</p>
          <p className="text-xs font-mono text-muted-foreground">{row.productCode || '—'}</p>
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
        <p className="text-xs font-bold text-foreground">¥{formatPriceYuan(row.priceAmount)}</p>
      )
    },
    {
      key: 'authorization',
      header: '关联授权',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-xs font-bold text-foreground">
            {authorizationTemplateLabelByCode.get(priceAuthorizationCodesByPriceId.get(row.id)?.[0] ?? '') || '未绑定'}
          </p>
          <p className="text-xs font-mono text-muted-foreground">{priceAuthorizationCodesByPriceId.get(row.id)?.[0] ?? '—'}</p>
        </div>
      )
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => <StatusPill tone={statusToTone(row.status || 'inactive')} label={row.status || 'inactive'} />
    },
    {
      key: 'actions',
      header: '操作',
      cell: (row) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => openEditDialog(row)}>
            <Pencil className="mr-1 h-3.5 w-3.5" />
            编辑
          </Button>
          {row.productCode ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/admin/products/${row.productCode}`}>查看产品</Link>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">未绑定</span>
          )}
        </div>
      )
    }
  ];

  return (
    <div>
      <SectionHeader sectionKey="pricing" />
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>价格方案总数</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-foreground">{allPrices.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">当前 catalog 中全部价格方案数量。</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>订阅型方案</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-foreground">
                {allPrices.filter((price) => price.interval === 'month' || price.interval === 'year').length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">月付、年付等周期性计费方案。</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>买断型方案</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-foreground">
                {allPrices.filter((price) => price.interval === 'one_time').length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">一次性收费或买断授权方案。</p>
            </CardContent>
          </Card>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.04)]">
          <div className="border-b border-slate-200/80 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-black text-slate-900">价格方案目录</p>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={allPrices.length > 0 ? 'ok' : 'warn'} label={allPrices.length > 0 ? '已建立价格结构' : '暂无价格方案'} />
                <Button onClick={openCreateDialog}>
                  <Plus className="mr-1 h-4 w-4" />
                  新建价格方案
                </Button>
              </div>
            </div>
          </div>
          <DataTable
            columns={columns}
            data={allPrices}
            isLoading={isLoading}
            emptyMessage="暂无价格方案"
            getRowKey={(row) => row.id}
            rowClassName={() => 'hover:bg-slate-50/70 transition-colors'}
          />
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditingPrice(null);
              setForm(createEmptyPricingForm());
            }
          }}
        >
          <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPrice ? `编辑价格方案 ${editingPrice.name}` : '新建价格方案'}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>方案标识</Label>
                <Input
                  value={form.code}
                  onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                  disabled={Boolean(editingPrice)}
                  placeholder="pro_monthly"
                />
              </div>
              <div className="space-y-2">
                <Label>方案名称</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="专业版月付"
                />
              </div>
              <div className="space-y-2">
                <Label>所属产品</Label>
                <Select
                  value={form.productCode}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      productCode: value,
                      authorizationCode:
                        authorizationTemplates.some((authorizationTemplate) => {
                          const product = products.find((item) => item.id === authorizationTemplate.productId);
                          return product?.code === value && authorizationTemplate.code === current.authorizationCode;
                        })
                          ? current.authorizationCode
                          : ''
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择产品" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.code} value={product.code}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>计费周期</Label>
                <Select value={form.interval} onValueChange={(value) => setForm((current) => ({ ...current, interval: value as PricingFormState['interval'] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">month</SelectItem>
                    <SelectItem value="year">year</SelectItem>
                    <SelectItem value="one_time">one_time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>金额（分）</Label>
                <Input
                  value={form.priceAmount}
                  onChange={(event) => setForm((current) => ({ ...current, priceAmount: event.target.value }))}
                  inputMode="numeric"
                  placeholder="9900"
                />
              </div>
              <div className="space-y-2">
                <Label>币种</Label>
                <Input
                  value={form.currency}
                  onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                  placeholder="CNY"
                />
              </div>
              <div className="space-y-2">
                <Label>Billing Price ID</Label>
                <Input
                  value={form.billingPriceId}
                  onChange={(event) => setForm((current) => ({ ...current, billingPriceId: event.target.value }))}
                  placeholder="可选"
                />
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as PricingFormState['status'] }))}>
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
            </div>

            <div className="space-y-3">
              <Label>授权档位映射</Label>
              <div className="grid gap-2 rounded-2xl border border-border p-4">
                {availableAuthorizationTemplates.length > 0 ? (
                  availableAuthorizationTemplates.map((authorizationTemplate) => (
                    <label key={authorizationTemplate.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <Checkbox
                        checked={form.authorizationCode === authorizationTemplate.code}
                        onCheckedChange={(checked) => selectAuthorizationTemplate(authorizationTemplate.code, checked === true)}
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-foreground">{authorizationTemplate.name}</p>
                        <p className="text-xs font-mono text-muted-foreground">{authorizationTemplate.code}</p>
                      </div>
                    </label>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-muted-foreground">
                    先选择产品，并确保该产品已经有可用的授权档位。
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                <Save className="mr-1 h-4 w-4" />
                {saveMutation.isPending ? '保存中...' : '保存价格方案'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
