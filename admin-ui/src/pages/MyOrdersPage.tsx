import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSearch, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import { listMyOrders, syncMyOrder } from '@/api/user';
import { EmptyState } from '@/components/portal/EmptyState';
import { OrderCard } from '@/components/portal/OrderCard';
import { Card, CardContent } from '@/components/ui/card';

export function MyOrdersPage() {
  const qc = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ['my-orders'], queryFn: listMyOrders });
  const syncMutation = useMutation({
    mutationFn: syncMyOrder,
    onSuccess: () => {
      toast.success('订单状态已同步');
      void qc.invalidateQueries({ queryKey: ['my-orders'] });
      void qc.invalidateQueries({ queryKey: ['my-authorizations'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '同步失败');
    }
  });

  const orders = ordersQuery.data?.items ?? [];

  return (
    <div className="space-y-8">
      <section className="space-y-2 pt-4">
        <h1 className="text-4xl font-black tracking-tight text-slate-950">订单记录</h1>
        <p className="text-lg text-muted-foreground">查看和管理你的所有订单</p>
      </section>

      <div className="grid gap-4">
        {ordersQuery.isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center p-8">
              <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
            </CardContent>
          </Card>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={FileSearch}
            title="还没有订单记录"
            description="还没有订单记录，去产品中心看看吧"
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
    </div>
  );
}
