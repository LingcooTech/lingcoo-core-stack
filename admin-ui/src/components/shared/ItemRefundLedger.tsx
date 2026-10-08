import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatAmount, formatTime } from '@/lib/utils';
import type { ItemRefundCommand } from '@lingcoo/contracts';
export function ItemRefundLedger({ orderNo, admin = false }: { orderNo: string; admin?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="rounded-lg border p-3 text-sm"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">退款明细与进度</summary>
      {open && <Ledger orderNo={orderNo} admin={admin} />}
    </details>
  );
}
function Ledger({ orderNo, admin }: { orderNo: string; admin: boolean }) {
  const { user } = useAuth();
  const canRefund = admin && hasPermission(normalizeRole(user?.role), 'orders.refund');
  const queryClient = useQueryClient();
  const key = ['item-refunds', admin, orderNo];
  const result = useQuery({
    queryKey: key,
    queryFn: () =>
      admin
        ? apiClient(
            'GET /v1/admin/billing/orders/:orderNo/item-refunds',
            `/v1/admin/billing/orders/${encodeURIComponent(orderNo)}/item-refunds`,
          )
        : apiClient(
            'GET /v1/billing/orders/:orderNo/item-refunds',
            `/v1/billing/orders/${encodeURIComponent(orderNo)}/item-refunds`,
          ),
    refetchInterval: 30000,
  });
  const [selectedKind, setKind] = useState<'software' | 'hosting' | null>(null);
  const kind = selectedKind ?? result.data?.lines[0]?.kind ?? 'software';
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [command, setCommand] = useState<ItemRefundCommand | null>(null);
  const [notice, setNotice] = useState('');
  const update = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    await queryClient.invalidateQueries({ queryKey: ['orders'] });
  };
  const refund = useMutation({
    mutationFn: (input: ItemRefundCommand) =>
      apiClient(
        'POST /v1/admin/billing/orders/:orderNo/item-refunds',
        `/v1/admin/billing/orders/${encodeURIComponent(orderNo)}/item-refunds`,
        { body: JSON.stringify(input) },
      ),
    onSuccess: async () => {
      setCommand(null);
      setAmount('');
      setReason('');
      setNotice('申请已记录，请以账本中的处理结果为准。');
      await update();
    },
  });
  const reconcile = useMutation({
    mutationFn: (id: string) =>
      apiClient(
        'POST /v1/admin/billing/orders/:orderNo/item-refunds/:refundId/reconcile',
        `/v1/admin/billing/orders/${encodeURIComponent(orderNo)}/item-refunds/${id}/reconcile`,
        {},
      ),
    onSuccess: update,
  });
  if (result.isPending) return <p className="mt-3">正在读取退款记录…</p>;
  if (result.isError)
    return (
      <p role="alert" className="mt-3 text-destructive">
        退款记录读取失败。
        <Button
          variant="link"
          onClick={() => {
            void result.refetch();
          }}
        >
          重试
        </Button>
      </p>
    );
  const ledger = result.data;
  const line = ledger.lines.find((l) => l.kind === kind);
  const cents = Math.round(Number(amount) * 100);
  const valid =
    /^\d+(\.\d{1,2})?$/.test(amount) &&
    Number.isSafeInteger(cents) &&
    cents > 0 &&
    cents <= (line?.remaining ?? 0) &&
    reason.trim().length >= 5 &&
    reason.trim().length <= 500;
  const error = refund.error ?? reconcile.error;
  return (
    <div className="mt-3 space-y-3">
      {ledger.legacyRefund && <p>此订单使用原整单退款流程，请查看订单状态。</p>}
      {ledger.lines.map((l) => (
        <div key={l.kind} className="rounded-md bg-muted/50 p-3">
          <p className="font-medium">
            {l.kind === 'software' ? '软件' : '托管'} · {l.title}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <dt>原金额</dt>
              <dd>{formatAmount(l.amount, 'CNY')}</dd>
            </div>
            <div>
              <dt>已退款</dt>
              <dd>{formatAmount(l.refunded, 'CNY')}</dd>
            </div>
            <div>
              <dt>处理中</dt>
              <dd>{formatAmount(l.pending, 'CNY')}</dd>
            </div>
            <div>
              <dt>可退余额</dt>
              <dd>{formatAmount(l.remaining, 'CNY')}</dd>
            </div>
          </dl>
        </div>
      ))}
      {!ledger.records.length && <p className="text-muted-foreground">暂无分项退款记录。</p>}
      {ledger.records.map((r) => (
        <div key={r.id} className="border-t pt-2">
          <p>
            {r.kind === 'software' ? '软件' : '托管'} · {formatAmount(r.amount, 'CNY')} ·{' '}
            {r.status === 'pending'
              ? '等待渠道确认'
              : r.status === 'succeeded'
                ? '退款成功'
                : '退款失败'}
          </p>
          <p className="break-words text-muted-foreground">
            {r.reason} · {formatTime(r.createdAt)}
          </p>
          {canRefund && r.status === 'pending' && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={reconcile.isPending}
              onClick={() => reconcile.mutate(r.id)}
            >
              查询退款结果
            </Button>
          )}
        </div>
      ))}
      {canRefund &&
        ledger.orderStatus === 'paid' &&
        !ledger.legacyRefund &&
        ledger.lines.length > 0 && (
          <div className="space-y-3 border-t pt-3">
            <p>
              部分退款作为费用补偿，不缩短服务期限；累计全退会撤销对应权益。已部署服务须先处理终止与交接。
            </p>
            {!command ? (
              <>
                <label className="block">
                  退款项目
                  <select
                    aria-label="退款项目"
                    className="mt-1 block w-full rounded-md border bg-background p-2"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as 'software' | 'hosting')}
                  >
                    {ledger.lines.map((l) => (
                      <option key={l.kind} value={l.kind}>
                        {l.kind === 'software' ? '软件' : '托管'} · {l.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  退款金额（元）
                  <Input
                    aria-label="退款金额（元）"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <label className="block">
                  退款原因
                  <Input
                    aria-label="退款原因"
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <Button
                  variant="outline"
                  disabled={!valid}
                  onClick={() =>
                    setCommand({
                      requestId: crypto.randomUUID(),
                      kind,
                      amount: cents,
                      reason: reason.trim(),
                    })
                  }
                >
                  核对退款申请
                </Button>
              </>
            ) : (
              <div className="space-y-2 rounded-md border p-3">
                <p>
                  确认退还{command.kind === 'software' ? '软件' : '托管'}费用{' '}
                  {formatAmount(command.amount, 'CNY')}？
                </p>
                <p className="break-words">{command.reason}</p>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={refund.isPending} onClick={() => refund.mutate(command)}>
                    确认发起退款
                  </Button>
                  <Button
                    variant="outline"
                    disabled={refund.isPending}
                    onClick={() => {
                      setCommand(null);
                      refund.reset();
                    }}
                  >
                    返回修改
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error instanceof Error ? error.message : '请求失败，请刷新账本确认结果后重试。'}
        </p>
      )}
    </div>
  );
}
