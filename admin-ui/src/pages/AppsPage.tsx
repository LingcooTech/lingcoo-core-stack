import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { createAppSecret, listAppsAdmin, revokeAppSecret, upsertApp, type UpsertAppInput } from '@/api/apps';
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

type EditablePlan = {
  code: string;
  name: string;
  interval: string;
  priceYuan: string;
  currency: string;
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
  productCode: string;
  productName: string;
};

function formatPriceYuan(priceAmount?: number) {
  return ((priceAmount ?? 0) / 100).toFixed(2);
}

function formatPlanInterval(interval: string | null | undefined) {
  if (interval === 'month') {
    return '月付';
  }

  if (interval === 'year') {
    return '年付';
  }

  if (interval === 'one_time') {
    return '一次性';
  }

  return interval || '未设置';
}

function getCheckoutPlanCode(app: AppWithDetails | null) {
  if (!app?.meta || typeof app.meta !== 'object' || Array.isArray(app.meta)) {
    return '';
  }

  const value = app.meta.checkoutPlanCode;
  return typeof value === 'string' ? value : '';
}

function toEditablePlans(app: AppWithDetails | null): EditablePlan[] {
  return (app?.plans ?? []).map((plan) => ({
    code: plan.code,
    name: plan.name,
    interval: plan.interval ?? '',
    priceYuan: formatPriceYuan(plan.priceAmount),
    currency: plan.currency ?? 'CNY',
    status: (plan.status as EditablePlan['status']) ?? 'active',
    productCode: plan.productCode ?? '',
    productName: plan.productName ?? ''
  }));
}

// We need product list for checkbox - get from apps
function useProducts(apps: AppWithDetails[]) {
  const productMap = new Map<string, { code: string; name: string }>();
  apps.forEach((app) => {
    app.products?.forEach((p) => productMap.set(p.code, p));
  });
  return [...productMap.values()];
}

export function AppsPage() {
  const qc = useQueryClient();
  const [selectedApp, setSelectedApp] = useState<AppWithDetails | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [editablePlans, setEditablePlans] = useState<EditablePlan[]>([]);
  const [checkoutPlanCode, setCheckoutPlanCode] = useState('');
  const [secretResult, setSecretResult] = useState<{ secret: string; secretId: string; appCode: string } | null>(null);
  const [secretVisible, setSecretVisible] = useState(false);
  const [secretAppCode, setSecretAppCode] = useState('');
  const [secretExpiresAt, setSecretExpiresAt] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const apps = data?.items ?? [];
  const products = useProducts(apps);

  const appForm = useForm<AppFormValues>({
    resolver: zodResolver(appSchema),
    defaultValues: { name: '', description: '', type: 'web_app', status: 'active', productCodes: [] }
  });

  const upsertMutation = useMutation({
    mutationFn: ({
      code,
      values,
      planConfigs,
      meta
    }: {
      code: string;
      values: AppFormValues;
      planConfigs: UpsertAppInput['planConfigs'];
      meta: Record<string, unknown>;
    }) =>
      upsertApp(code, {
        ...values,
        planConfigs,
        meta
      }),
    onSuccess: () => {
      toast.success('应用配置已保存');
      void qc.invalidateQueries({ queryKey: ['apps'] });
      setSelectedApp(null);
      setIsNew(false);
      setEditablePlans([]);
      setCheckoutPlanCode('');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败')
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
    mutationFn: ({ appCode, secretId }: { appCode: string; secretId: string }) =>
      revokeAppSecret(appCode, secretId),
    onSuccess: () => {
      toast.success('Secret 已撤销');
      void qc.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '撤销失败')
  });

  const openEdit = (app: AppWithDetails) => {
    setIsNew(false);
    setSelectedApp(app);
    setEditablePlans(toEditablePlans(app));
    setCheckoutPlanCode(getCheckoutPlanCode(app));
    appForm.reset({
      name: app.name,
      description: app.description ?? '',
      type: app.type as AppFormValues['type'],
      status: app.status as AppFormValues['status'],
      productCodes: app.products?.map((p) => p.code) ?? []
    });
  };

  const openNew = () => {
    setIsNew(true);
    setSelectedApp(null);
    setEditablePlans([]);
    setCheckoutPlanCode('');
    appForm.reset({ name: '', description: '', type: 'web_app', status: 'active', productCodes: [] });
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
      key: 'products',
      header: '产品 / 价格',
      cell: (row) => (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {row.products?.map((p) => (
              <span key={p.code} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 font-mono">
                {p.code}
              </span>
            )) ?? <span className="text-xs text-muted-foreground">—</span>}
          </div>
          <div className="flex flex-wrap gap-1">
            {row.plans?.map((plan) => (
              <span key={plan.code} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded px-1.5 py-0.5 font-mono">
                {plan.code} ¥{formatPriceYuan(plan.priceAmount)}/{formatPlanInterval(plan.interval)}
              </span>
            )) ?? <span className="text-xs text-muted-foreground">—</span>}
          </div>
        </div>
      )
    },
    {
      key: 'secrets',
      header: 'Secrets',
      cell: (row) => {
        const active = row.secrets?.filter((s) => !s.expiresAt || new Date(s.expiresAt) > new Date()).length ?? 0;
        return <span className="text-xs text-muted-foreground">{active} 个有效</span>;
      }
    },
    {
      key: 'actions',
      header: '操作',
      cell: (row) => (
        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>
          编辑
        </Button>
      )
    }
  ];

  const editingCode = isNew
    ? ''
    : selectedApp?.code ?? '';
  const selectedProductCodes = appForm.watch('productCodes');
  const visiblePlans = editablePlans.filter((plan) => selectedProductCodes.includes(plan.productCode));

  return (
    <div>
      <SectionHeader sectionKey="apps" />
      <div className="p-6">
        <Tabs defaultValue="apps">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="apps">应用列表</TabsTrigger>
              <TabsTrigger value="secrets">Secret 管理</TabsTrigger>
            </TabsList>
            <Button size="sm" onClick={openNew}>
              <Plus className="w-4 h-4 mr-1" />
              新建应用
            </Button>
          </div>

          <TabsContent value="apps">
            <div className="rounded-2xl border border-border overflow-hidden bg-white">
              <DataTable
                columns={appColumns}
                data={apps}
                isLoading={isLoading}
                emptyMessage="暂无应用"
                getRowKey={(row) => row.id}
              />
            </div>
          </TabsContent>

          <TabsContent value="secrets">
            <div className="max-w-xl space-y-6">
              <div className="rounded-2xl border border-border bg-white p-5">
                <h3 className="text-sm font-black mb-4">生成 App Secret</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-bold block mb-1.5">选择应用</label>
                    <Select value={secretAppCode} onValueChange={setSecretAppCode}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择应用..." />
                      </SelectTrigger>
                      <SelectContent>
                        {apps.map((a) => (
                          <SelectItem key={a.code} value={a.code}>{a.name} ({a.code})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-bold block mb-1.5">过期时间（留空永不过期）</label>
                    <Input type="datetime-local" value={secretExpiresAt} onChange={(e) => setSecretExpiresAt(e.target.value)} />
                  </div>
                  <Button
                    disabled={!secretAppCode || secretMutation.isPending}
                    onClick={() => secretMutation.mutate({
                      appCode: secretAppCode,
                      expiresAt: secretExpiresAt ? new Date(secretExpiresAt).toISOString() : undefined
                    })}
                  >
                    {secretMutation.isPending ? '生成中...' : '一键生成 Secret'}
                  </Button>
                </div>
              </div>

              {/* Secret list by app */}
              {apps.filter((a) => (a.secrets?.length ?? 0) > 0).map((app) => (
                <div key={app.code} className="rounded-2xl border border-border bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/30">
                    <p className="text-sm font-black">{app.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{app.code}</p>
                  </div>
                  {app.secrets?.map((secret) => (
                    <div key={secret.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-0">
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
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* App Editor Dialog */}
      <Dialog open={isNew || !!selectedApp} onOpenChange={(open) => { if (!open) { setSelectedApp(null); setIsNew(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? '新建应用' : `编辑 ${selectedApp?.name}`}</DialogTitle>
            <DialogDescription>
              {isNew ? '创建新的接入应用' : `应用标识: ${selectedApp?.code}`}
            </DialogDescription>
          </DialogHeader>
          <Form {...appForm}>
            <form onSubmit={appForm.handleSubmit((v) => {
              const code = isNew ? v.name.toLowerCase().replace(/\s+/g, '_') : editingCode;
              const meta = { ...(selectedApp?.meta ?? {}) };
              const nextCheckoutPlanCode = visiblePlans.some((plan) => plan.code === checkoutPlanCode) ? checkoutPlanCode : '';

              if (nextCheckoutPlanCode) {
                meta.checkoutPlanCode = nextCheckoutPlanCode;
              } else {
                delete meta.checkoutPlanCode;
              }

              upsertMutation.mutate({
                code,
                values: v,
                meta,
                planConfigs: visiblePlans.map((plan) => ({
                  code: plan.code,
                  priceAmount: Math.round(Number(plan.priceYuan || '0') * 100),
                  currency: plan.currency,
                  status: plan.status
                }))
              });
            })} className="space-y-4">
              {isNew && (
                <div>
                  <label className="text-sm font-bold block mb-1.5">应用标识 (code)</label>
                  <p className="text-xs text-muted-foreground mb-2">创建后不可修改，用于 API 调用</p>
                  <Input placeholder="ai_web_translator_ext" />
                </div>
              )}
              <FormField control={appForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>应用名称</FormLabel>
                  <FormControl><Input placeholder="My App" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={appForm.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>类型</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chrome_extension">Chrome Extension</SelectItem>
                        <SelectItem value="web_app">Web App</SelectItem>
                        <SelectItem value="service">Service</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={appForm.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>状态</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={appForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>描述（可选）</FormLabel>
                  <FormControl><Input placeholder="应用简介" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {products.length > 0 && (
                <FormField control={appForm.control} name="productCodes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>绑定产品</FormLabel>
                    <div className="space-y-2">
                      {products.map((p) => (
                        <label key={p.code} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={field.value.includes(p.code)}
                            onCheckedChange={(checked) => {
                              const next = checked
                                ? [...field.value, p.code]
                                : field.value.filter((c) => c !== p.code);
                              field.onChange(next);
                            }}
                          />
                          <span className="text-sm font-mono">{p.code}</span>
                          <span className="text-xs text-muted-foreground">{p.name}</span>
                        </label>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
                <div>
                  <p className="text-sm font-black">订阅与价格</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    这里直接管理该应用可售计划的价格，并指定扩展默认发起的 checkout 计划。
                  </p>
                </div>
                {visiblePlans.length === 0 ? (
                  <p className="text-xs text-muted-foreground">当前选中的产品下还没有可管理的计划。</p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-bold block mb-1.5">默认 Checkout 计划</label>
                      <Select value={checkoutPlanCode} onValueChange={setCheckoutPlanCode}>
                        <SelectTrigger>
                          <SelectValue placeholder="按月付优先自动选择" />
                        </SelectTrigger>
                        <SelectContent>
                          {visiblePlans.map((plan) => (
                            <SelectItem key={plan.code} value={plan.code}>
                              {plan.name} ({plan.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {visiblePlans.map((plan) => (
                      <div key={plan.code} className="rounded-xl border border-border bg-white p-3 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black">{plan.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {plan.code} · {plan.productCode} · {formatPlanInterval(plan.interval)}
                            </p>
                          </div>
                          <StatusPill tone={statusToTone(plan.status)} label={plan.status} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-bold block mb-1.5">价格（元）</label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={plan.priceYuan}
                              onChange={(event) => {
                                setEditablePlans((current) =>
                                  current.map((item) =>
                                    item.code === plan.code ? { ...item, priceYuan: event.target.value } : item
                                  )
                                );
                              }}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold block mb-1.5">状态</label>
                            <Select
                              value={plan.status}
                              onValueChange={(value) => {
                                setEditablePlans((current) =>
                                  current.map((item) =>
                                    item.code === plan.code
                                      ? { ...item, status: value as EditablePlan['status'] }
                                      : item
                                  )
                                );
                              }}
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
                        </div>
                      </div>
                    ))}
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

      {/* Secret Result Dialog */}
      <Dialog open={!!secretResult} onOpenChange={(open) => { if (!open) setSecretResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Secret 已生成 ⚠️</DialogTitle>
            <DialogDescription>
              此 Secret 只显示一次，请立即复制保存。关闭后将无法再次查看。
            </DialogDescription>
          </DialogHeader>
          {secretResult && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs">
                <p className="font-black text-amber-800 mb-1">appCode: {secretResult.appCode}</p>
                <p className="font-black text-amber-800 mb-1">secretId: {secretResult.secretId}</p>
              </div>
              <div className="relative">
                <div className="p-3 rounded-xl bg-slate-950 font-mono text-xs text-green-400 pr-16 break-all">
                  {secretVisible ? secretResult.secret : '•'.repeat(Math.min(secretResult.secret.length, 40))}
                </div>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => setSecretVisible((v) => !v)}>
                    {secretVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => {
                    void navigator.clipboard.writeText(secretResult.secret);
                    toast.success('已复制到剪贴板');
                  }}>
                    <Copy className="w-3.5 h-3.5" />
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
