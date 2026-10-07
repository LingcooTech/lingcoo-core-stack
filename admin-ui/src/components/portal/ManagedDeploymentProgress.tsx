import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ManagedDeployment } from '@lingcoo/contracts';
import { toast } from 'sonner';
import { retryManagedAllocation } from '@/api/user';
import { Button } from '@/components/ui/button';

export function ManagedDeploymentProgress({
  managed,
  deploymentId,
}: {
  managed: ManagedDeployment;
  deploymentId?: string;
}) {
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: retryManagedAllocation,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-4" role="status">
      <p className="text-sm font-semibold">
        {managed.state === 'cancelled'
          ? '托管申请已取消'
          : managed.nodeAssigned
            ? '服务器已分配，等待部署接入'
            : '托管申请已提交，等待可用服务器'}
      </p>
      <p className="font-mono text-sm">{managed.hostname}</p>
      {managed.state !== 'cancelled' ? (
        <p className="text-sm text-muted-foreground">
          {managed.nodeAssigned
            ? '地址已预留。应用部署、域名解析和 HTTPS 尚未完成，目前不可访问。'
            : '平台会检查服务器健康状态和剩余容量，有可用资源时自动分配。地址已预留，目前不可访问。'}
        </p>
      ) : null}
      {managed.state === 'waiting_capacity' && deploymentId ? (
        <Button
          variant="outline"
          size="sm"
          disabled={retry.isPending}
          onClick={() => retry.mutate(deploymentId)}
        >
          {retry.isPending ? '检查中…' : '重新检查可用资源'}
        </Button>
      ) : null}
    </div>
  );
}
