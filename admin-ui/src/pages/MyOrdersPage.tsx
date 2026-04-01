import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSearch, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import { listMyOrders, syncMyOrder } from '@/api/user';
import { EmptyState } from '@/components/portal/EmptyState';
import { MetricStrip } from '@/components/portal/MetricStrip';
import { OrderCard } from '@/components/portal/OrderCard';
import { PageHeader } from '@/components/portal/PageHeader';
import { Card, CardContent } from '@/components/ui/card';

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

  return (
    <div className="space-y-6">
      <PageHeader sectionKey="orders" />

      <MetricStrip
        items={[
          { label: 'Total Orders', value: orders.length, note: '当前账号下可追踪的订单数量。' },
          { label: 'Paid Orders', value: orders.filter((item) => item.status === 'paid').length, note: '已经完成支付并应生成授权的订单。' },
          { label: 'Pending Orders', value: orders.filter((item) => item.status === 'pending').length, note: '仍可能处于支付中的订单，可继续主动同步。' },
          { label: 'Next Stage', value: 'Delivery Link', note: '后续会把部署记录和交付入口挂回订单链路。' }
        ]}
      />

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
            title="当前还没有订单"
            description="先从产品中心选择一个应用开始购买。支付完成后，这里会成为授权与交付链路的上游入口。"
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
