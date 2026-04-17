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
    <Card className="rounded-[28px] border-slate-200/80 bg-white/95 shadow-sm shadow-slate-900/5">
      <CardHeader className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xl tracking-tight">{order.app?.name ?? '未命名产品'}</CardTitle>
            <Badge variant={order.status === 'paid' ? 'default' : 'secondary'}>{order.status}</Badge>
          </div>
          <CardDescription className="text-sm leading-7">
            订单号 {order.orderNo} · {order.plan?.name ?? '未命名套餐'} · {order.provider ?? '未指定渠道'}
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
              创建于 {formatTime(order.createdAt)}
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
              支付时间 {order.paidAt ? formatTime(order.paidAt) : '未支付'}
            </span>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50/80 px-5 py-4 text-left sm:min-w-[180px] sm:text-right">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Order Total</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{formatAmount(order.amount, order.currency)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Checkout：{order.checkoutSession?.sessionCode ?? '—'}</p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm leading-7 text-muted-foreground">
          当前记录会和支付状态、授权状态保持同步。若外部支付渠道已完成，但这里还未更新，可以手动触发同步。
        </div>
        <Button variant="outline" className="rounded-2xl" onClick={() => onSync(order.orderNo)} disabled={syncing}>
          <RefreshCw className="h-4 w-4" />
          同步订单状态
        </Button>
      </CardContent>
    </Card>
  );
}
