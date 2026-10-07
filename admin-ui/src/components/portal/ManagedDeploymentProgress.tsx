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
        {managed.state === 'ready'
          ? '部署完成，可访问应用'
          : managed.state === 'pending_tls'
            ? '解析已配置，正在接通 HTTPS'
            : managed.state === 'cancelled'
              ? '托管申请已取消'
              : managed.state === 'runtime_ready'
                ? '应用运行就绪，等待域名接入'
                : managed.state === 'deploying'
                  ? '正在部署应用'
                  : managed.state === 'failed'
                    ? '部署失败，数据已保留'
                    : managed.nodeAssigned
                      ? '服务器已分配，等待部署接入'
                      : '托管申请已提交，等待可用服务器'}
      </p>
      {managed.state === 'ready' && managed.accessUrl ? (
        <a
          className="font-mono text-sm underline"
          href={managed.accessUrl}
          target="_blank"
          rel="noreferrer"
        >
          {managed.hostname}
        </a>
      ) : (
        <p className="font-mono text-sm">{managed.hostname}</p>
      )}
      {managed.state !== 'cancelled' ? (
        <p className="text-sm text-muted-foreground">
          {managed.state === 'ready'
            ? '公网 HTTPS 与实例路由检查已通过。'
            : managed.state === 'pending_tls'
              ? '等待解析生效、证书签发及公网检查，完成后显示访问入口。'
              : managed.state === 'runtime_ready'
                ? '服务器内的 Web、API、Worker 和数据库检查已通过。域名与 HTTPS 尚未接通，目前不可公开访问。'
                : managed.state === 'failed'
                  ? '保留原配置、数据和容量预留。可重试原任务；请勿删除数据卷来重试。'
                  : managed.nodeAssigned
                    ? '地址已预留。应用部署、域名解析和 HTTPS 尚未完成，目前不可访问。'
                    : '平台会检查服务器健康状态和剩余容量，有可用资源时自动分配。地址已预留，目前不可访问。'}
        </p>
      ) : null}
      {['waiting_capacity', 'failed'].includes(managed.state) && deploymentId ? (
        <Button
          variant="outline"
          size="sm"
          disabled={retry.isPending}
          onClick={() => retry.mutate(deploymentId)}
        >
          {retry.isPending
            ? '检查中…'
            : managed.state === 'failed'
              ? '重试部署'
              : '重新检查可用资源'}
        </Button>
      ) : null}
    </div>
  );
}
