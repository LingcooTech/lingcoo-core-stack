import type { OrderItem } from '@lingcoo/contracts';
import { formatAmount } from '@/lib/utils';

export function OrderItems({ items }: { items?: OrderItem[] }) {
  return (
    <section className="w-full rounded-lg border p-4 text-sm">
      <h3 className="mb-3 font-semibold">购买明细</h3>
      {!items?.length ? (
        <p className="text-xs text-muted-foreground">
          历史订单未记录购买快照，请以订单总金额及原始购买凭证为准。
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.kind} className="flex flex-wrap justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.kind === 'software' ? '软件授权' : '托管服务'} ·{' '}
                  {item.interval === 'one_time'
                    ? '一次性'
                    : item.interval === 'month'
                      ? '自然月'
                      : '自然年'}{' '}
                  × {item.quantity}
                </p>
                {item.hostingTerms && (
                  <p className="mt-1 max-w-lg text-xs break-words text-muted-foreground">
                    {item.hostingTerms.description} · 首次交付后起算，不自动扣费；宽限{' '}
                    {item.hostingTerms.graceDays} 天，数据保留 {item.hostingTerms.retentionDays} 天
                  </p>
                )}
              </div>
              <span className="font-medium tabular-nums">
                {formatAmount(item.amount, item.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
