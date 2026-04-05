import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { grantEntitlement, listEntitlements, revokeEntitlement } from '@/api/admin';
import type { HydratedEntitlement } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { formatTime } from '@/lib/utils';

const grantSchema = z.object({
  userEmail: z.string().email('请输入有效邮箱'),
  planCode: z.string().min(1, '请选择套餐'),
  reason: z.string().optional()
});
type GrantValues = z.infer<typeof grantSchema>;

export function LicensesPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['entitlements', 100],
    queryFn: () => listEntitlements(100)
  });
  const entitlements = data?.items ?? [];

  const grantForm = useForm<GrantValues>({
    resolver: zodResolver(grantSchema),
    defaultValues: { userEmail: '', planCode: '', reason: '' }
  });

  const grantMutation = useMutation({
    mutationFn: grantEntitlement,
    onSuccess: (result) => {
      if (result.granted) {
        toast.success(`授权已发放给 ${result.user.email}，套餐 ${result.plan.code}，共 ${result.entitlementCount} 条`);
      } else {
        toast.info(`未重复发放：${result.user.email} 已拥有该 one_time 权益`);
      }
      grantForm.reset();
      void qc.invalidateQueries({ queryKey: ['entitlements'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '授权失败')
  });

  const revokeMutation = useMutation({
    mutationFn: revokeEntitlement,
    onSuccess: (result) => {
      toast.success(`已撤销 ${result.revokedCount} 条授权`);
      void qc.invalidateQueries({ queryKey: ['entitlements'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '撤销失败')
  });

  const columns: Column<HydratedEntitlement>[] = [
    {
      key: 'user',
      header: '用户',
      cell: (row) => (
        <div>
          <p className="text-xs font-bold">{row.user?.email ?? row.userId}</p>
          {row.user?.displayName && <p className="text-xs text-muted-foreground">{row.user.displayName}</p>}
          <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">{row.id}</p>
        </div>
      )
    },
    {
      key: 'product',
      header: '产品/功能',
      cell: (row) => (
        <div>
          <p className="text-xs font-bold font-mono">{row.product?.code ?? row.productId}</p>
          {row.feature && <p className="text-xs text-muted-foreground">{row.feature.code}</p>}
        </div>
      )
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <StatusPill tone={statusToTone(row.status)} label={row.status} />
          <span className="text-[10px] text-muted-foreground">{row.sourceType}</span>
        </div>
      )
    },
    {
      key: 'source',
      header: '来源',
      cell: (row) => (
        <div>
          {row.sourceOrder ? (
            <p className="text-xs font-mono">{row.sourceOrder.orderNo}</p>
          ) : (
            <p className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">{row.sourceId ?? '—'}</p>
          )}
          <p className="text-[10px] text-muted-foreground">{row.sourceType}</p>
        </div>
      )
    },
    {
      key: 'validity',
      header: '有效期',
      cell: (row) => (
        <div>
          <p className="text-xs">{row.expiresAt ? formatTime(row.expiresAt) : '永不过期'}</p>
          {row.startsAt && <p className="text-[10px] text-muted-foreground">从 {formatTime(row.startsAt)}</p>}
        </div>
      )
    },
    {
      key: 'actions',
      header: '操作',
      cell: (row) => (
        row.status === 'active' ? (
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 hover:text-red-700 text-xs"
            disabled={revokeMutation.isPending}
            onClick={() => {
              if (confirm(`确认撤销 ${row.user?.email ?? row.userId} 的授权？`)) {
                revokeMutation.mutate(row.id);
              }
            }}
          >
            撤销
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">已撤销</span>
        )
      )
    }
  ];

  return (
    <div>
      <SectionHeader sectionKey="licenses" />
      <div className="p-6 space-y-6">
        {/* Grant Form */}
        <div className="max-w-lg rounded-2xl border border-border bg-white p-5">
          <h3 className="text-sm font-black mb-4">人工发放授权</h3>
          <Form {...grantForm}>
            <form onSubmit={grantForm.handleSubmit((v) => grantMutation.mutate(v))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={grantForm.control} name="userEmail" render={({ field }) => (
                  <FormItem>
                    <FormLabel>用户邮箱</FormLabel>
                    <FormControl><Input type="email" placeholder="user@example.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={grantForm.control} name="planCode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>套餐 Code</FormLabel>
                    <FormControl><Input placeholder="pro_monthly" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={grantForm.control} name="reason" render={({ field }) => (
                <FormItem>
                  <FormLabel>备注（可选）</FormLabel>
                  <FormControl><Textarea placeholder="发放原因..." className="min-h-[60px]" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" disabled={grantMutation.isPending}>
                {grantMutation.isPending ? '发放中...' : '发放授权'}
              </Button>
            </form>
          </Form>
        </div>

        {/* Entitlements Table */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black text-muted-foreground uppercase tracking-wider">
              授权明细 ({entitlements.length})
            </h3>
          </div>
          <div className="rounded-2xl border border-border bg-white overflow-hidden">
            <DataTable
              columns={columns}
              data={entitlements}
              isLoading={isLoading}
              emptyMessage="暂无授权记录"
              getRowKey={(row) => row.id}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
