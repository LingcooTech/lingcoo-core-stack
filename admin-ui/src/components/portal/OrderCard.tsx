import { RefreshCw } from 'lucide-react';

import type { HydratedOrder } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { canSyncOrderStatus, orderStatusLabel, paymentProviderLabel } from '@/lib/portal-labels';
import { formatAmount, formatTime } from '@/lib/utils';

function orderStatusDescription(status: string) {
  switch (status) {
    case 'pending':
      return '等待支付渠道确认。如果你已经完成付款，可以手动同步订单状态。';
    case 'paid':
      return '订单已完成支付，系统会自动发放或保留对应授权。';
    case 'failed':
      return '支付未完成或渠道返回失败，可重新发起购买或稍后同步状态。';
    case 'refunding':
      return '退款正在处理中，完成后授权状态可能会同步变化。';
    case 'refunded':
      return '订单已退款，对应授权可能已失效。';
    case 'cancelled':
      return '订单已取消，不会继续发放授权。';
    default:
      return '订单记录会和支付状态、授权状态保持同步。';
  }
}

export function OrderCard({
  order,
  onSync,
  syncing,
}: {
  order: HydratedOrder;
  onSync: (orderNo: string) => void;
  syncing?: boolean;
}) {
  return (
    <Card className="border-border/80 bg-card/95 rounded-lg shadow-sm">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xl tracking-tight">
              {order.app?.name ?? '未命名产品'}
            </CardTitle>
            <Badge variant={order.status === 'paid' ? 'default' : 'secondary'}>
              {orderStatusLabel(order.status)}
            </Badge>
          </div>
          <CardDescription className="text-sm leading-6">
            订单号 {order.orderNo} · {order.plan?.name ?? '未命名套餐'} ·{' '}
            {paymentProviderLabel(order.provider)}
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            <span className="border-border bg-muted text-foreground inline-flex rounded-full border px-3 py-1.5 text-xs font-medium">
              创建于 {formatTime(order.createdAt)}
            </span>
            <span className="border-border bg-muted text-foreground inline-flex rounded-full border px-3 py-1.5 text-xs font-medium">
              支付时间 {order.paidAt ? formatTime(order.paidAt) : '未支付'}
            </span>
          </div>
        </div>
        <div className="border-border bg-muted/80 rounded-lg border px-4 py-3.5 text-left sm:min-w-[170px] sm:text-right">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-wider">订单金额</p>
          <p className="text-foreground mt-1.5 text-2xl font-semibold tracking-tight">
            {formatAmount(order.amount, order.currency)}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            支付会话：{order.checkoutSession?.sessionCode ?? '—'}
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-muted-foreground text-sm leading-7">
          {orderStatusDescription(order.status)}
        </div>
        {canSyncOrderStatus(order.status) ? (
          <Button
            variant="outline"
            className="rounded-lg"
            onClick={() => onSync(order.orderNo)}
            disabled={syncing}
          >
            <RefreshCw className="h-4 w-4" />
            同步订单状态
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
