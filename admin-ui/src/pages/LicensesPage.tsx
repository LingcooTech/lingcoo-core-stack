import { handleAsync } from '@/lib/async-events';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { grantEntitlement, listEntitlements, revokeEntitlement } from '@/api/admin';
import { listAppsAdmin, listCatalogPlans } from '@/api/apps';
import type { HydratedEntitlement, PlanSummary } from '@/api/types';
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterChipBar } from '@/components/shared/FilterChipBar';
import { PaginationBar } from '@/components/shared/PaginationBar';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useTableState } from '@/hooks/useTableState';
import { entitlementSourceLabel, entitlementStatusLabel } from '@/lib/portal-labels';
import { formatAmount, formatTime } from '@/lib/utils';

const PAGE_SIZE = 20;

const grantSchema = z.object({
  userEmail: z.string().email('请输入有效邮箱'),
  planCode: z.string().min(1, '请选择套餐'),
  reason: z.string().optional(),
});
type GrantValues = z.infer<typeof grantSchema>;

function formatPlanInterval(interval: string | null | undefined) {
  if (interval === 'month') return '月付';
  if (interval === 'year') return '年付';
  if (interval === 'one_time') return '一次性';
  return interval || '未设置';
}

export function LicensesPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [entitlementToRevoke, setEntitlementToRevoke] = useState<HydratedEntitlement | null>(null);
  const { page, search, setPage, setSearch } = useTableState({ defaultPageSize: PAGE_SIZE });
  const deferredSearchQuery = useDeferredValue(search);
  const entitlementQuery = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: deferredSearchQuery.trim() || undefined,
    }),
    [deferredSearchQuery, page],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['entitlements', entitlementQuery],
    queryFn: () => listEntitlements(entitlementQuery),
  });
  const { data: plansData, isLoading: isPlansLoading } = useQuery({
    queryKey: ['catalog-plans'],
    queryFn: listCatalogPlans,
  });
  const { data: appsData } = useQuery({
    queryKey: ['apps'],
    queryFn: listAppsAdmin,
  });
  const entitlements = data?.items ?? [];
  const totalEntitlements = data?.total ?? 0;
  const appsById = useMemo(
    () => new Map((appsData?.items ?? []).map((app) => [app.id, app])),
    [appsData?.items],
  );

  const planGroups = useMemo(() => {
    const grouped = new Map<string, { appName: string; appCode: string; plans: PlanSummary[] }>();
    const plans = [...(plansData?.items ?? [])].sort((a, b) => a.code.localeCompare(b.code));
    for (const plan of plans) {
      const app = plan.appId ? appsById.get(plan.appId) : null;
      const key = app?.id ?? 'unassigned';
      const existing = grouped.get(key);
      if (existing) {
        existing.plans.push(plan);
        continue;
      }
      grouped.set(key, {
        appName: app?.name ?? '未关联应用',
        appCode: app?.code ?? 'unassigned',
        plans: [plan],
      });
    }
    return [...grouped.values()].sort((a, b) => a.appName.localeCompare(b.appName));
  }, [appsById, plansData?.items]);

  const grantForm = useForm<GrantValues>({
    resolver: zodResolver(grantSchema),
    defaultValues: { userEmail: '', planCode: '', reason: '' },
  });
  const grantUserEmail = searchParams.get('grantUserEmail');

  useEffect(() => {
    if (!grantUserEmail) return;
    if (grantForm.getValues('userEmail') === grantUserEmail) return;
    grantForm.setValue('userEmail', grantUserEmail, { shouldDirty: true, shouldValidate: true });
  }, [grantForm, grantUserEmail]);

  const selectedPlanCode = grantForm.watch('planCode');
  const selectedPlan = useMemo(
    () => (plansData?.items ?? []).find((plan) => plan.code === selectedPlanCode) ?? null,
    [plansData?.items, selectedPlanCode],
  );
  const selectedPlanApp = selectedPlan?.appId ? appsById.get(selectedPlan.appId) : null;

  const grantMutation = useMutation({
    mutationFn: grantEntitlement,
    onSuccess: (result) => {
      if (result.granted) {
        toast.success(`授权已发放给 ${result.user.email}，套餐 ${result.plan.code}`);
      } else {
        toast.info(`未重复发放：${result.user.email} 已拥有该 one_time 权益`);
      }
      grantForm.reset();
      void qc.invalidateQueries({ queryKey: ['entitlements'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '授权失败'),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeEntitlement,
    onSuccess: (result) => {
      toast.success(`已撤销 ${result.revokedCount} 条授权`);
      void qc.invalidateQueries({ queryKey: ['entitlements'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '撤销失败'),
  });

  const columns: Column<HydratedEntitlement>[] = [
    {
      key: 'user',
      header: '用户',
      cell: (row) => (
        <div>
          <p className="text-xs font-bold">{row.user?.email ?? row.userId}</p>
          {row.user?.displayName && (
            <p className="text-xs text-muted-foreground">{row.user.displayName}</p>
          )}
          <p className="max-w-[120px] truncate font-mono text-[10px] text-muted-foreground">
            {row.id}
          </p>
        </div>
      ),
    },
    {
      key: 'app',
      header: '应用/套餐',
      cell: (row) => (
        <div>
          <p className="font-mono text-xs font-bold">{row.app?.code ?? row.appId}</p>
          {row.plan && <p className="text-xs text-muted-foreground">{row.plan.code}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <StatusPill tone={statusToTone(row.status)} label={entitlementStatusLabel(row.status)} />
          <span className="text-[10px] text-muted-foreground">
            {entitlementSourceLabel(row.sourceType)}
          </span>
        </div>
      ),
    },
    {
      key: 'source',
      header: '来源',
      cell: (row) => (
        <div>
          {row.sourceOrder ? (
            <p className="font-mono text-xs">{row.sourceOrder.orderNo}</p>
          ) : (
            <p className="max-w-[120px] truncate font-mono text-xs text-muted-foreground">
              {row.sourceId ?? '—'}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            {entitlementSourceLabel(row.sourceType)}
          </p>
        </div>
      ),
    },
    {
      key: 'validity',
      header: '有效期',
      cell: (row) => (
        <div>
          <p className="text-xs">{row.expiresAt ? formatTime(row.expiresAt) : '永不过期'}</p>
          {row.startsAt && (
            <p className="text-[10px] text-muted-foreground">从 {formatTime(row.startsAt)}</p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      cell: (row) =>
        row.status === 'active' ? (
          <Button
            size="sm"
            variant="outline"
            className="text-xs text-destructive hover:text-destructive"
            disabled={revokeMutation.isPending}
            onClick={() => setEntitlementToRevoke(row)}
          >
            撤销
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">已撤销</span>
        ),
    },
  ];

  return (
    <div>
      <SectionHeader sectionKey="licenses" />
      <div className="space-y-6 p-6">
        {/* Grant Form */}
        <div className="max-w-lg rounded-lg border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold">人工发放授权</h3>
          <Form {...grantForm}>
            <form
              onSubmit={handleAsync(grantForm.handleSubmit((v) => grantMutation.mutate(v)))}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={grantForm.control}
                  name="userEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>用户邮箱</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="user@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={grantForm.control}
                  name="planCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>套餐</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isPlansLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={isPlansLoading ? '加载套餐中...' : '选择套餐'}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {planGroups.map((group) => (
                            <SelectGroup key={group.appCode}>
                              <SelectLabel>{group.appName}</SelectLabel>
                              {group.plans.map((plan) => (
                                <SelectItem key={plan.code} value={plan.code}>
                                  {plan.name} ({plan.code})
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedPlan ? (
                        <FormDescription>
                          {selectedPlanApp ? `${selectedPlanApp.name} / ` : ''}
                          {formatPlanInterval(selectedPlan.interval)}
                          {typeof selectedPlan.priceAmount === 'number'
                            ? ` / ${formatAmount(selectedPlan.priceAmount, selectedPlan.currency ?? 'CNY')}`
                            : ''}
                        </FormDescription>
                      ) : (
                        <FormDescription>
                          从已存在的 plan 中选择，避免手输 code 出错。
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={grantForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>备注（可选）</FormLabel>
                    <FormControl>
                      <Textarea placeholder="发放原因..." className="min-h-[60px]" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={grantMutation.isPending}>
                {grantMutation.isPending ? '发放中...' : '发放授权'}
              </Button>
            </form>
          </Form>
        </div>

        {/* Entitlements Table */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
              授权明细 ({totalEntitlements})
            </h3>
          </div>
          <div className="mb-4">
            <FilterChipBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="搜索用户、应用、套餐、订单号..."
            />
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <DataTable
              columns={columns}
              data={entitlements}
              isLoading={isLoading}
              emptyMessage="暂无授权记录"
              getRowId={(row) => row.id}
            />
          </div>
          <div className="mt-4">
            <PaginationBar
              total={totalEntitlements}
              page={page}
              pageSize={PAGE_SIZE}
              isLoading={isLoading}
              itemLabel="条授权记录"
              onPageChange={setPage}
            />
          </div>
        </div>
      </div>

      <ConfirmActionDialog
        open={!!entitlementToRevoke}
        onOpenChange={(open) => {
          if (!open) setEntitlementToRevoke(null);
        }}
        title="确认撤销授权？"
        description={
          entitlementToRevoke
            ? `将撤销 ${entitlementToRevoke.user?.email ?? entitlementToRevoke.userId} 的当前授权。`
            : undefined
        }
        confirmText="撤销授权"
        isConfirming={revokeMutation.isPending}
        onConfirm={() => {
          if (!entitlementToRevoke) return;
          const targetId = entitlementToRevoke.id;
          setEntitlementToRevoke(null);
          revokeMutation.mutate(targetId);
        }}
      />
    </div>
  );
}
