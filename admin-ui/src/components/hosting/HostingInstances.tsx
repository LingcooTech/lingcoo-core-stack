import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, RotateCw, Archive, Box, Search } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { StatusPill } from '@/components/shared/StatusPill';
import { formatTime } from '@/lib/utils';
import { useHostingOverview } from './useHostingOverview';
import { ResourceMeter, HostingEmpty, HostingLoading } from './HostingVisuals';
const states: Record<string, string> = {
  pending: '等待执行',
  running: '执行中',
  succeeded: '成功',
  failed: '失败',
};
const deploymentStates: Record<string, string> = {
  ready: '运行就绪',
  waiting_capacity: '等待资源',
  pending_infrastructure: '准备环境',
  deploying: '部署中',
  runtime_ready: '验证入口',
  pending_tls: '配置证书',
  failed: '部署失败',
  cancelled: '已取消',
};
export function HostingInstances({
  view = 'instances',
  nodeNames = {},
  deploymentId,
}: {
  view?: 'instances' | 'operations';
  deploymentId?: string;
  nodeNames?: Record<string, string>;
}) {
  const qc = useQueryClient();
  const overview = useHostingOverview();
  const [search, setSearch] = useState('');
  const [confirmation, setConfirmation] = useState<{
    id: string;
    label: string;
    kind: 'restart' | 'backup';
  } | null>(null);
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
      setConfirmation(null);
      toast.success('运维任务已提交，等待节点执行');
    },
    onError: (e) => toast.error(e.message),
  });
  const instances = (overview.data?.instances ?? []).filter(
    (i) =>
      (!deploymentId || i.id === deploymentId) &&
      `${i.label} ${i.customerEmail} ${i.hostname ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const operations = (overview.data?.operations ?? []).filter((o) =>
    `${overview.data?.instances.find((i) => i.id === o.deploymentId)?.label ?? o.deploymentId} ${states[o.state]}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <section className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-semibold">{view === 'instances' ? '托管实例' : '运维记录'}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {view === 'instances'
              ? '管理平台托管的应用；客户自有服务器由客户自行运维。'
              : '查看最近 100 条任务的执行结果与时间。'}
          </p>
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            aria-label={view === 'instances' ? '搜索托管实例' : '搜索运维记录'}
            placeholder={view === 'instances' ? '搜索实例、客户或域名' : '搜索实例或任务状态'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {overview.isError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {overview.error.message}
          <Button variant="ghost" size="sm" onClick={() => void overview.refetch()}>
            重试
          </Button>
        </p>
      ) : overview.isPending ? (
        <HostingLoading />
      ) : view === 'instances' ? (
        <>
          {!instances.length ? (
            <HostingEmpty
              title={search ? '没有匹配的托管实例' : '暂无托管实例'}
              description={
                search
                  ? '尝试其他名称、客户或域名。'
                  : '客户选择平台托管并创建部署后，实例会显示在这里。'
              }
            />
          ) : null}
          {instances.map((instance) => {
            const task = overview.data.operations.find(
              (o) => o.deploymentId === instance.id && ['pending', 'running'].includes(o.state),
            );
            const unavailable =
              !!task ||
              operation.isPending ||
              !instance.telemetryFresh ||
              instance.state !== 'ready';
            const bad = instance.services.some(
              (c) => c.state !== 'running' || c.health === 'unhealthy',
            );
            return (
              <article key={instance.id} className="overflow-hidden rounded-xl border bg-card">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                      <Box className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold">{instance.label}</h3>
                      <p className="mt-1 text-xs break-all text-muted-foreground">
                        {instance.customerEmail} · {instance.appCode}
                      </p>
                    </div>
                  </div>
                  <StatusPill
                    tone={
                      !instance.telemetryFresh
                        ? 'neutral'
                        : bad || instance.state === 'failed'
                          ? 'danger'
                          : instance.state === 'ready'
                            ? 'ok'
                            : 'warn'
                    }
                    label={
                      !instance.telemetryFresh
                        ? '报告已过期'
                        : bad
                          ? '服务异常'
                          : (deploymentStates[instance.state ?? ''] ?? '待确认')
                    }
                  />
                </div>
                <div className="grid gap-6 p-5 lg:grid-cols-[1.2fr_1fr]">
                  <div className="space-y-4">
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">应用入口</p>
                      {instance.hostname ? (
                        <a
                          className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium break-all text-primary hover:underline"
                          href={'https://' + instance.hostname}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {instance.hostname}
                          <ExternalLink className="size-3.5 shrink-0" />
                        </a>
                      ) : (
                        <p className="text-sm">等待分配访问地址</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      服务器：
                      {instance.nodeId ? (nodeNames[instance.nodeId] ?? '已分配节点') : '等待分配'}
                    </p>
                    <ResourceMeter
                      label="实例内存 / 预算"
                      value={
                        instance.telemetryFresh && instance.services.length
                          ? instance.services.reduce((sum, c) => sum + c.memoryMb, 0)
                          : null
                      }
                      total={instance.resources?.memoryMb ?? null}
                    />
                    <div className="flex flex-wrap gap-2">
                      {instance.services.map((c) => (
                        <StatusPill
                          key={c.name}
                          tone={
                            c.state !== 'running' || c.health === 'unhealthy'
                              ? 'danger'
                              : c.health === 'starting'
                                ? 'warn'
                                : 'ok'
                          }
                          label={`${c.service} · ${c.state !== 'running' ? '已停止' : c.health === 'unhealthy' ? '异常' : c.health === 'starting' ? '启动中' : '运行中'}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3 rounded-lg bg-muted/30 p-4">
                    <h4 className="flex items-center gap-2 text-xs font-semibold">
                      <Archive className="size-4" />
                      数据保护
                    </h4>
                    {[
                      {
                        label: '本地备份',
                        status: instance.backup?.status,
                        time: instance.backup?.completedAt,
                      },
                      {
                        label: '异机加密副本',
                        status: instance.backup?.offsiteStatus,
                        time: instance.backup?.offsiteAt,
                      },
                    ].map((b) => {
                      const stale = !!b.time && Date.now() - Date.parse(b.time) > 36 * 3600000;
                      return (
                        <div key={b.label} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span>{b.label}</span>
                            <StatusPill
                              tone={
                                b.status === 'failed'
                                  ? 'danger'
                                  : b.status === 'success' && !stale
                                    ? 'ok'
                                    : 'warn'
                              }
                              label={
                                b.status === 'failed'
                                  ? '失败'
                                  : stale
                                    ? '已过期'
                                    : b.status === 'success'
                                      ? '已完成'
                                      : b.status === 'pending'
                                        ? '待上传'
                                        : '未就绪'
                              }
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {b.time ? formatTime(b.time) : '暂无成功记录'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3">
                  <span className="text-xs text-muted-foreground">
                    {task
                      ? states[task.state]
                      : !instance.telemetryFresh
                        ? '等待节点恢复上报后可操作'
                        : '操作结果可在运维记录中追踪'}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={unavailable}
                      onClick={() =>
                        setConfirmation({ id: instance.id, label: instance.label, kind: 'restart' })
                      }
                    >
                      <RotateCw className="size-3.5" />
                      重启应用
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={unavailable}
                      onClick={() =>
                        setConfirmation({ id: instance.id, label: instance.label, kind: 'backup' })
                      }
                    >
                      <Archive className="size-3.5" />
                      立即备份
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                {['请求时间', '实例', '操作', '状态', '结果'].map((t) => (
                  <th className="px-5 py-3 font-medium" key={t}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {operations.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="px-5 py-4 text-xs whitespace-nowrap text-muted-foreground">
                    {formatTime(o.createdAt)}
                  </td>
                  <td className="px-5 py-4 font-medium">
                    {overview.data.instances.find((i) => i.id === o.deploymentId)?.label ??
                      o.deploymentId}
                  </td>
                  <td className="px-5 py-4 text-xs">
                    {o.kind === 'restart' ? '重启应用' : '备份'}
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill
                      tone={
                        o.state === 'succeeded' ? 'ok' : o.state === 'failed' ? 'danger' : 'warn'
                      }
                      label={states[o.state] ?? '待确认'}
                    />
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">
                    {o.result === 'verified'
                      ? '节点验证通过'
                      : o.result === 'lease_expired'
                        ? '执行超时，请检查节点'
                        : o.result === 'execution_failed'
                          ? '执行失败，请检查节点'
                          : '等待节点回报'}
                  </td>
                </tr>
              ))}
              {!operations.length ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-sm text-muted-foreground">
                    暂无匹配的运维记录
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
      <Dialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open && !operation.isPending) setConfirmation(null);
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>
              {confirmation?.kind === 'restart' ? '重启应用' : '创建一致性备份'}
            </DialogTitle>
            <DialogDescription>
              {confirmation?.label}：
              {confirmation?.kind === 'restart'
                ? '将重启应用服务，期间会短暂不可用，数据库继续运行。'
                : '将短暂停止应用写入，完成本地备份后上传已配置的异机加密仓库。'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={operation.isPending}
              onClick={() => setConfirmation(null)}
            >
              取消
            </Button>
            <Button
              disabled={operation.isPending}
              onClick={() => {
                if (confirmation)
                  operation.mutate({ ...confirmation, requestKey: crypto.randomUUID() });
              }}
            >
              {operation.isPending ? '正在提交…' : '确认执行'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
