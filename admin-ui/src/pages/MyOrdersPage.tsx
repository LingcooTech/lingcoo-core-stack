import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CreditCard, FileSearch, LoaderCircle, RefreshCw, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import { listMyOrders, syncMyOrder } from '@/api/user';
import { EmptyState } from '@/components/portal/EmptyState';
import { OrderCard } from '@/components/portal/OrderCard';
import { Card, CardContent } from '@/components/ui/card';
import { formatAmount } from '@/lib/utils';

export function MyOrdersPage() {
  const qc = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ['my-orders'], queryFn: listMyOrders });
  const syncMutation = useMutation({
    mutationFn: syncMyOrder,
    onSuccess: () => {
      toast.success('订单状态已同步');
      void qc.invalidateQueries({ queryKey: ['my-orders'] });
      void qc.invalidateQueries({ queryKey: ['my-entitlements'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '同步失败');
    }
  });

  const orders = ordersQuery.data?.items ?? [];
  const paidOrders = orders.filter((order) => order.status === 'paid');
  const pendingOrders = orders.filter((order) => order.status !== 'paid');
  const paidTotal = paidOrders.reduce((sum, order) => sum + order.amount, 0);

  return (
    <div className="space-y-10">
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr),360px]">
        <div className="rounded-[32px] border border-slate-200/80 bg-white/92 p-8 shadow-sm shadow-slate-900/5">
          <p className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-500">Orders</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950">订单记录</h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
            这里不只是历史账单列表，而是用户确认支付状态、回看套餐、判断授权同步是否正常的主入口。
            页面结构应该优先表达“已支付、待同步、累计金额”这些用户真正关心的信息。
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              {
                label: '全部订单',
                value: String(orders.length),
                note: '当前账户下的全部支付记录'
              },
              {
                label: '已支付',
                value: String(paidOrders.length),
                note: '已完成付款并通常已进入授权链路'
              },
              {
                label: '待同步',
                value: String(pendingOrders.length),
                note: '可手动点击同步订单状态'
              }
            ].map((item) => (
              <div key={item.label} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">{item.label}</p>
                <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{item.value}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{item.note}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          {[
            {
              icon: Wallet,
              title: '累计支付',
              value: paidTotal > 0 ? formatAmount(paidTotal, paidOrders[0]?.currency ?? 'CNY') : '¥0.00',
              note: '已支付订单金额汇总'
            },
            {
              icon: RefreshCw,
              title: '状态同步',
              value: pendingOrders.length > 0 ? `${pendingOrders.length} 笔待处理` : '全部完成',
              note: '支付渠道返回后可在这里补做同步'
            },
            {
              icon: CheckCircle2,
              title: '授权链路',
              value: paidOrders.length > 0 ? '已打通' : '待建立',
              note: '支付成功后会继续进入应用授权与部署链路'
            }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title} className="border-slate-200/80 bg-white/92 shadow-sm shadow-slate-900/5">
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">{item.title}</p>
                    <p className="text-2xl font-black tracking-tight text-slate-950">{item.value}</p>
                    <p className="text-sm leading-7 text-slate-600">{item.note}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-5">
        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-500">Order Timeline</p>
          <h2 className="text-3xl font-black tracking-tight text-slate-950">全部订单</h2>
        </div>

        <div className="grid gap-4">
          {ordersQuery.isLoading ? (
            <Card className="rounded-[28px] border-slate-200/80 bg-white/95">
              <CardContent className="flex items-center justify-center gap-3 p-10 text-slate-500">
                <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
                正在加载订单记录...
              </CardContent>
            </Card>
          ) : orders.length === 0 ? (
            <EmptyState
              icon={FileSearch}
              title="还没有订单记录"
              description="还没有订单记录，去应用中心看看吧。"
            />
          ) : (
            orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onSync={(orderNo) => syncMutation.mutate(orderNo)}
                syncing={syncMutation.isPending}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
