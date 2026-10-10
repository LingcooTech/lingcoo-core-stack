import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { handoverCommandSchema } from '@lingcoo/contracts';
import type { z } from 'zod';
import { apiClient } from '@/api/client';
type Command = z.infer<typeof handoverCommandSchema>;
export function useHostingHandover(deploymentId: string, version: number, admin: boolean) {
  const path = `/v1/${admin ? 'admin/' : ''}deployments/${deploymentId}/handover`,
    qc = useQueryClient();
  const pending = useRef<{ kind: string; key: string } | null>(null);
  const [download, setDownload] = useState<{ url: string; expiresAt: string } | null>(null);
  const query = useQuery({
    queryKey: ['hosting-handover', deploymentId, admin],
    queryFn: () =>
      admin
        ? apiClient('GET /v1/admin/deployments/:deploymentId/handover', path)
        : apiClient('GET /v1/deployments/:deploymentId/handover', path),
    refetchInterval: 15000,
  });
  const mutation = useMutation({
    mutationFn: (command: Command) =>
      admin
        ? apiClient('POST /v1/admin/deployments/:deploymentId/handover', path, {
            body: JSON.stringify(command),
          })
        : apiClient('POST /v1/deployments/:deploymentId/handover', path, {
            body: JSON.stringify(command),
          }),
    onSuccess: (result, command) => {
      pending.current = null;
      void qc.invalidateQueries({ queryKey: ['hosting-handover', deploymentId] });
      void qc.invalidateQueries({ queryKey: ['hosting-exit', deploymentId] });
      void qc.invalidateQueries({ queryKey: ['hosting-overview'] });
      if (result.downloadPath && result.expiresAt)
        setDownload({ url: result.downloadPath, expiresAt: result.expiresAt });
      if (result.identity && command.kind === 'key') {
        const url = URL.createObjectURL(new Blob([result.identity + '\n'], { type: 'text/plain' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = command.handoverId + '.key.txt';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    },
  });
  function request(kind: 'prepare' | 'reclaim') {
    if (pending.current?.kind !== kind) pending.current = { kind, key: crypto.randomUUID() };
    mutation.mutate({
      kind,
      requestKey: pending.current.key,
      expectedVersion: version,
      ...(kind === 'reclaim' ? { confirmDeploymentId: deploymentId } : {}),
    } as Command);
  }
  const reclamation = query.data?.reclamation;
  return { download, query, mutation, request, reclamation };
}
