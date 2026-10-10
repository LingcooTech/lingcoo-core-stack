import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hostingExitCommandSchema, type HostingExitCommand } from '@lingcoo/contracts';
import { apiClient } from '@/api/client';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';
export function useHostingExit(deploymentId: string, admin: boolean, open: boolean) {
  const { user } = useAuth();
  const canManage = admin && hasPermission(normalizeRole(user?.role), 'settings.manage');
  const qc = useQueryClient();
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const [validation, setValidation] = useState('');
  const path = `/v1/${admin ? 'admin/' : ''}deployments/${deploymentId}/hosting-exit`;
  const query = useQuery({
    queryKey: ['hosting-exit', deploymentId, admin],
    enabled: open,
    queryFn: () =>
      admin
        ? apiClient('GET /v1/admin/deployments/:deploymentId/hosting-exit', path)
        : apiClient('GET /v1/deployments/:deploymentId/hosting-exit', path),
    refetchInterval: open ? 15000 : false,
  });
  const mutation = useMutation({
    mutationFn: (input: HostingExitCommand) =>
      admin
        ? apiClient('POST /v1/admin/deployments/:deploymentId/hosting-exit', path, {
            body: JSON.stringify(input),
          })
        : apiClient('POST /v1/deployments/:deploymentId/hosting-exit', path, {
            body: JSON.stringify(input),
          }),
    onSuccess: () => {
      pending.current = null;
      void qc.invalidateQueries({ queryKey: ['hosting-exit', deploymentId] });
      void qc.invalidateQueries({ queryKey: ['hosting-overview'] });
    },
  });
  const exit = query.data?.exit;
  function submit(kind: string, fieldsInput: Record<string, unknown>) {
    const fields = {
      kind,
      ...(kind === 'request' ? { reason: fieldsInput.reason } : { expectedVersion: exit?.version }),
      ...(kind === 'start' ? { retentionDays: Number(fieldsInput.retentionDays) } : {}),
      ...(kind === 'handover' ? { reference: fieldsInput.reference } : {}),
    };
    const fingerprint = JSON.stringify(fields);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    const parsed = hostingExitCommandSchema.safeParse({
      ...fields,
      requestKey: pending.current.key,
    });
    if (!parsed.success) {
      setValidation('请填写完整信息：原因/交接说明至少 5 字，保留期为 1–3650 天。');
      return;
    }
    setValidation('');
    mutation.mutate(parsed.data);
  }
  const kind =
    !exit || exit.state === 'withdrawn'
      ? 'request'
      : canManage && exit.state === 'requested'
        ? 'start'
        : canManage && exit.state === 'retained'
          ? 'handover'
          : !admin && exit.state === 'retained' && exit.handoverReference
            ? 'acknowledge'
            : null;
  return { canManage, query, mutation, exit, kind, validation, submit };
}
