import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatTime } from '@/lib/utils';
export function HostingUpgradePanel({ deploymentId }: { deploymentId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false),
    [releaseId, setReleaseId] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const pending = useRef<{ releaseId: string; image: string; key: string } | null>(null);
  const path = `/v1/admin/deployments/${deploymentId}/upgrades`;
  const query = useQuery({
    queryKey: ['hosting-upgrade', deploymentId],
    queryFn: () => apiClient('GET /v1/admin/deployments/:deploymentId/upgrades', path),
    enabled: open,
    refetchInterval: open ? 15000 : false,
  });
  const mutation = useMutation({
    mutationFn: () => {
      const image = query.data?.currentImage;
      if (!image) throw Error('缺少当前镜像');
      if (
        !pending.current ||
        pending.current.releaseId !== releaseId ||
        pending.current.image !== image
      )
        pending.current = { releaseId, image, key: crypto.randomUUID() };
      return apiClient('POST /v1/admin/deployments/:deploymentId/upgrades', path, {
        body: JSON.stringify({
          releaseId,
          expectedImage: image,
          requestKey: pending.current.key,
          confirmDeploymentId: confirmation,
        }),
      });
    },
    onSuccess: () => {
      pending.current = null;
      setReleaseId('');
      setConfirmation('');
      void qc.invalidateQueries({ queryKey: ['hosting-upgrade', deploymentId] });
      void qc.invalidateQueries({ queryKey: ['hosting-overview'] });
    },
  });
  const selected = query.data?.releases.find((r) => r.id === releaseId);
  return (
    <details
      className="rounded-lg border p-4 text-sm"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">受控升级</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          升级会短暂停服，先保存冷备份和异机副本，再验证新版本；失败时回退旧镜像。仅支持已审核、无需数据库迁移的版本。
        </p>
        {query.isError ? (
          <p role="alert">{query.error.message}</p>
        ) : query.isPending ? (
          <p>正在检查升级条件…</p>
        ) : (
          <>
            <p className="text-xs break-all">
              当前镜像：{query.data.currentImage ?? '等待节点报告'}
            </p>
            {query.data.blockedReason ? (
              <p role="status">{query.data.blockedReason}</p>
            ) : (
              <>
                <label className="block space-y-2">
                  目标版本
                  <select
                    className="w-full rounded-md border bg-background p-2"
                    aria-label="目标升级版本"
                    value={releaseId}
                    onChange={(e) => setReleaseId(e.target.value)}
                  >
                    <option value="">请选择已审核版本</option>
                    {query.data.releases.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                {selected && (
                  <>
                    <p className="text-xs break-all">目标镜像：{selected.toImage}</p>
                    <p className="text-xs break-all">审核依据：{selected.reviewEvidence}</p>
                    <label className="block space-y-2">
                      确认维护，请输入实例编号：
                      <span className="block break-all">{deploymentId}</span>
                      <Input
                        aria-label="升级确认实例编号"
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                      />
                    </label>
                    <Button
                      disabled={mutation.isPending || confirmation !== deploymentId}
                      onClick={() => mutation.mutate()}
                    >
                      {mutation.isPending ? '正在提交…' : '确认停服备份并升级'}
                    </Button>
                  </>
                )}
              </>
            )}
            {mutation.isError && <p role="alert">{mutation.error.message}</p>}
            {query.data.history.map((h) => (
              <div key={h.operationId} className="space-y-1 rounded-md border p-3">
                <p>
                  {h.plan.label} ·{' '}
                  {h.evidence?.outcome === 'upgraded'
                    ? '升级成功'
                    : h.evidence?.outcome === 'rolled_back'
                      ? '已回退旧版本'
                      : h.evidence?.outcome === 'rejected'
                        ? '预检拒绝，原版本保持运行'
                        : '维护中，等待节点验证'}
                </p>
                <p className="text-xs text-muted-foreground">{formatTime(h.createdAt)}</p>
                {h.evidence?.backup && (
                  <p className="text-xs break-all">冷备份：{h.evidence.backup.backupId}</p>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </details>
  );
}
