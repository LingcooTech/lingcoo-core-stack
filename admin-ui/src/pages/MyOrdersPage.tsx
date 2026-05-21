import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSearch, LoaderCircle } from 'lucide-react';
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
    },
  });

  const orders = ordersQuery.data?.items ?? [];
  const paidOrders = orders.filter((order) => order.status === 'paid');
  const pendingOrders = orders.filter((order) => order.status !== 'paid');
  const paidTotal = paidOrders.reduce((sum, order) => sum + order.amount, 0);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-foreground text-4xl font-semibold tracking-tight">订单记录</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: '全部订单', value: String(orders.length) },
          { label: '已支付', value: String(paidOrders.length) },
          { label: '待同步', value: String(pendingOrders.length) },
        ].map((item) => (
          <div key={item.label} className="border-border bg-card rounded-xl border p-4 shadow-sm">
            <p className="text-muted-foreground text-sm font-medium">{item.label}</p>
            <p className="text-foreground mt-2 text-3xl font-semibold tracking-tight">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-foreground text-2xl font-semibold tracking-tight">全部订单</h2>
          <p className="text-muted-foreground text-sm">
            已支付 {paidOrders.length} 笔，累计{' '}
            {formatAmount(paidTotal, paidOrders[0]?.currency ?? 'CNY')}
          </p>
        </div>

        <div className="grid gap-4">
          {ordersQuery.isLoading ? (
            <Card className="border-border bg-card rounded-xl">
              <CardContent className="text-muted-foreground flex items-center justify-center gap-3 p-10">
                <LoaderCircle className="text-primary h-6 w-6 animate-spin" />
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
