import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileEdit, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { listAppsAdmin, upsertApp } from '@/api/apps';
import type { AppWithDetails } from '@/api/types';
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
import { DataTable, type Column } from '@/components/shared/DataTable';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useCatalogData } from '@/hooks/useCatalogData';
import {
  appSchema,
  type AppFormValues,
  type EditableOffer,
  slugify,
  formatPriceYuan,
  formatPlanInterval,
  createEmptyOffer,
  offersFromApp
} from '@/lib/catalog-utils';

export function AppsPage() {
  const qc = useQueryClient();
  const [selectedApp, setSelectedApp] = useState<AppWithDetails | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [editableOffers, setEditableOffers] = useState<EditableOffer[]>([]);

  const { data: appsData, isLoading: isAppsLoading } = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const apps = appsData?.items ?? [];

  const { products, allPlans } = useCatalogData();

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
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); openEdit(row); }}>
            编辑
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/admin/apps/${row.code}/edit`}>
              <FileEdit className="mr-1 h-3.5 w-3.5" />
              编辑详情
            </Link>
          </Button>
        </div>
      )
    }
  ];

  const editingCode = isNew ? '' : selectedApp?.code ?? '';

  return (
    <div>
      <div className="p-6">
        <h1 className="text-2xl font-black tracking-tight">应用管理</h1>
        <p className="text-sm text-muted-foreground mt-1">管理接入应用及其定价配置</p>
      </div>
      <div className="p-6 pt-0">
        <div className="mb-4 flex items-center justify-end">
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" />
            新建应用
          </Button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <DataTable
            columns={appColumns}
            data={apps}
            isLoading={isAppsLoading}
            emptyMessage="暂无应用"
            getRowKey={(row) => row.id}
          />
        </div>
      </div>

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
                    当前还没有配置应用级 offer。保存后，前端会回退到基础 plan；如果你要自定义价格梯度，请先点"添加 Offer"。
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
    </div>
  );
}
