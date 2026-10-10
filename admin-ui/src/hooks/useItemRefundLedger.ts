import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { ItemRefundCommand } from '@lingcoo/contracts';
export function useItemRefundActions(orderNo: string, admin: boolean, onRefunded: () => void) {
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
      onRefunded();
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
  return { canRefund, result, refund, reconcile, error: refund.error ?? reconcile.error };
}
export function useItemRefundLedger(orderNo: string, admin: boolean) {
  const [selectedKind, setKind] = useState<'software' | 'hosting' | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [command, setCommand] = useState<ItemRefundCommand | null>(null);
  const [notice, setNotice] = useState('');
  const { canRefund, result, refund, reconcile, error } = useItemRefundActions(
    orderNo,
    admin,
    () => {
      setCommand(null);
      setAmount('');
      setReason('');
      setNotice('申请已记录，请以账本中的处理结果为准。');
    },
  );
  const kind = selectedKind ?? result.data?.lines[0]?.kind ?? 'software';
  const ledger = result.data;
  const line = ledger?.lines.find((l) => l.kind === kind);
  const cents = Math.round(Number(amount) * 100);
  const valid =
    /^\d+(\.\d{1,2})?$/.test(amount) &&
    Number.isSafeInteger(cents) &&
    cents > 0 &&
    cents <= (line?.remaining ?? 0) &&
    reason.trim().length >= 5 &&
    reason.trim().length <= 500;
  return {
    canRefund,
    result,
    kind,
    setKind,
    amount,
    setAmount,
    reason,
    setReason,
    command,
    setCommand,
    notice,
    refund,
    reconcile,
    cents,
    valid,
    error,
  };
}
