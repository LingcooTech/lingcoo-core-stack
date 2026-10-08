import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTime } from '@/lib/utils';
const states: Record<string, string> = {
  pending: '等待执行',
  running: '执行中',
  succeeded: '成功',
  failed: '失败',
};
export function HostingInstances() {
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: ['hosting-overview'],
    queryFn: () => apiClient('GET /v1/admin/hosting/overview', '/v1/admin/hosting/overview'),
    refetchInterval: 15000,
  });
  const operation = useMutation({
    mutationFn: ({
      id,
      kind,
      requestKey,
    }: {
      id: string;
      kind: 'restart' | 'backup';
      requestKey: string;
    }) =>
      apiClient(
        'POST /v1/admin/hosting/instances/:param/operations',
        `/v1/admin/hosting/instances/${id}/operations`,
        { body: JSON.stringify({ kind, requestKey }) },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hosting-overview'] });
      toast.success('运维任务已提交，等待节点执行');
    },
    onError: (e) => toast.error(e.message),
  });
  const request = (id: string, kind: 'restart' | 'backup') => {
    if (
      window.confirm(
        kind === 'restart'
          ? '将重启该实例的应用进程，期间会短暂不可用。确认继续？'
          : '将短暂停止该实例写入，生成一致性备份并执行已配置的异机备份。确认继续？',
      )
    )
      operation.mutate({ id, kind, requestKey: crypto.randomUUID() });
  };
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">托管实例与运维任务</h2>
      <p className="text-sm text-muted-foreground">
        操作只作用于平台创建的实例，数据库不会因重启操作被重建。展示最近 100 条任务和最多 1000
        个活跃实例。
      </p>
      {overview.isError ? <p role="alert">{overview.error.message}</p> : null}
      {overview.isPending ? <p>正在读取实例…</p> : null}
      {overview.data?.instances.length === 0 ? <p>暂无平台托管实例。</p> : null}
      {overview.data?.instances.map((instance) => {
        const busy = overview.data.operations.some(
          (o) => o.deploymentId === instance.id && ['pending', 'running'].includes(o.state),
        );
        return (
          <Card key={instance.id}>
            <CardHeader>
              <CardTitle>{instance.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>
                {instance.appCode} · {instance.customerEmail} · {instance.state}
              </p>
              {instance.hostname ? (
                <a
                  className="text-primary underline"
                  href={'https://' + instance.hostname}
                  target="_blank"
                  rel="noreferrer"
                >
                  {instance.hostname}
                </a>
              ) : null}
              <p>
                节点：{instance.nodeId ?? '待分配'} · 遥测：
                {instance.telemetryFresh ? '正常' : '已过期或尚未上报'}
              </p>
              <p>
                当前内存：{instance.services.reduce((sum, c) => sum + c.memoryMb, 0).toFixed(1)} MiB
                / 预算 {instance.resources?.memoryMb ?? '未知'} MiB
              </p>
              <p>
                服务：
                {instance.services.map((c) => `${c.service} ${c.state}/${c.health}`).join('；') ||
                  '待上报'}
              </p>
              <p>
                本地备份：
                {instance.backup?.completedAt
                  ? formatTime(instance.backup.completedAt)
                  : '尚无成功记录'}
                （{instance.backup?.status ?? '未知'}）
              </p>
              <p>
                异机加密备份：
                {instance.backup?.offsiteAt
                  ? formatTime(instance.backup.offsiteAt)
                  : '尚无成功记录'}
                （{instance.backup?.offsiteStatus ?? '未配置'}）
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={
                    busy ||
                    operation.isPending ||
                    !instance.telemetryFresh ||
                    instance.state !== 'ready'
                  }
                  onClick={() => request(instance.id, 'restart')}
                >
                  重启应用
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    busy ||
                    operation.isPending ||
                    !instance.telemetryFresh ||
                    instance.state !== 'ready'
                  }
                  onClick={() => request(instance.id, 'backup')}
                >
                  立即备份
                </Button>
                {busy ? <span>运维任务处理中</span> : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
      <details open>
        <summary className="cursor-pointer font-medium">近期运维记录</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>时间</th>
                <th>实例</th>
                <th>动作</th>
                <th>状态</th>
                <th>结果</th>
              </tr>
            </thead>
            <tbody>
              {overview.data?.operations.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="py-2">{formatTime(o.createdAt)}</td>
                  <td>
                    {overview.data.instances.find((i) => i.id === o.deploymentId)?.label ??
                      o.deploymentId}
                  </td>
                  <td>{o.kind === 'restart' ? '重启' : '备份'}</td>
                  <td>{states[o.state]}</td>
                  <td>
                    {o.result === 'verified'
                      ? '节点验证通过'
                      : o.result === 'lease_expired'
                        ? '执行超时，需检查后重新发起'
                        : o.result === 'execution_failed'
                          ? '执行失败，请查看节点诊断'
                          : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
