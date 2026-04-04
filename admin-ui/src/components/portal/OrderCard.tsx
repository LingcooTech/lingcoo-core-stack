import { RefreshCw } from 'lucide-react';

import type { HydratedOrder } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatAmount, formatTime } from '@/lib/utils';

export function OrderCard({
  order,
  onSync,
  syncing
}: {
  order: HydratedOrder;
  onSync: (orderNo: string) => void;
  syncing?: boolean;
}) {
  return (
    <Card className="border-slate-200/80 bg-white/95">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{order.app?.name ?? order.product?.name ?? '未命名产品'}</CardTitle>
            <Badge variant={order.status === 'paid' ? 'default' : 'secondary'}>{order.status}</Badge>
          </div>
          <CardDescription>
            订单号 {order.orderNo} · {order.price?.name ?? '未命名价格方案'} · {order.provider ?? '未指定渠道'}
          </CardDescription>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xl font-black">{formatAmount(order.amount, order.currency)}</p>
          <p className="text-xs text-muted-foreground">创建于 {formatTime(order.createdAt)}</p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          支付时间：{order.paidAt ? formatTime(order.paidAt) : '未支付'} · Checkout：{order.checkoutSession?.sessionCode ?? '—'}
        </div>
        <Button variant="outline" onClick={() => onSync(order.orderNo)} disabled={syncing}>
          <RefreshCw className="h-4 w-4" />
          同步订单状态
        </Button>
      </CardContent>
    </Card>
  );
}
