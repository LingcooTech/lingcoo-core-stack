import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/utils';
export function HostingIncidents() {
  const [state, setState] = useState('active');
  const [offset, setOffset] = useState(0);
  const result = useQuery({
    queryKey: ['hosting-incidents', state, offset],
    queryFn: () =>
      apiClient(
        'GET /v1/admin/hosting/incidents',
        `/v1/admin/hosting/incidents?state=${state}&limit=30&offset=${offset}`,
      ),
    refetchInterval: 30000,
  });
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">托管告警与恢复记录</h2>
          <p className="text-sm text-muted-foreground">
            按登记实例核对服务、备份、节点和服务期限。报告缺失不代表运行正常。
          </p>
        </div>
        <select
          aria-label="告警状态"
          className="rounded-md border bg-background p-2 text-sm"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setOffset(0);
          }}
        >
          <option value="active">待处理</option>
          <option value="resolved">已恢复或退出监测</option>
        </select>
      </header>
      {result.isError ? (
        <p role="alert" className="text-destructive">
          告警读取失败。
          <Button variant="link" onClick={() => void result.refetch()}>
            重试
          </Button>
        </p>
      ) : result.isPending ? (
        <p>正在读取…</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {result.data.lastScanAt
              ? `最近扫描：${formatTime(result.data.lastScanAt)}；当前 ${result.data.activeCount} 项待处理`
              : '尚未完成首次扫描，不能据此判断健康状态。'}
          </p>
          {result.data.lastScanAt &&
            Date.now() - Date.parse(result.data.lastScanAt) > 10 * 60000 && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
              >
                监测已超过 10 分钟未更新，请检查平台 Worker。
              </p>
            )}
          {!result.data.items.length ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
              此筛选下暂无记录。
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {result.data.items.map((item) => (
                <article key={item.id} className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        item.state === 'resolved'
                          ? 'text-muted-foreground'
                          : item.severity === 'critical'
                            ? 'text-destructive'
                            : 'text-amber-700'
                      }
                    >
                      {item.state === 'resolved'
                        ? item.resolution === 'retired'
                          ? '已退出监测'
                          : '已恢复'
                        : item.severity === 'critical'
                          ? '异常'
                          : '提醒'}
                    </span>
                    <h3 className="font-medium">{item.title}</h3>
                  </div>
                  <p className="font-mono text-xs break-all text-muted-foreground">
                    {item.scope === 'node' ? '节点' : '实例'} {item.resourceId}
                  </p>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">首次发现</dt>
                      <dd>{formatTime(item.firstDetectedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">最近异常</dt>
                      <dd>{formatTime(item.lastDetectedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">发生次数</dt>
                      <dd>{item.occurrences}</dd>
                    </div>
                    {item.resolvedAt && (
                      <div>
                        <dt className="text-muted-foreground">状态变更</dt>
                        <dd>{formatTime(item.resolvedAt)}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <a
                      className="text-primary underline"
                      href={
                        item.scope === 'node'
                          ? '/admin/hosting?tab=servers'
                          : `/admin/hosting?tab=instances&deploymentId=${item.resourceId}`
                      }
                    >
                      查看{item.scope === 'node' ? '服务器' : '实例'}
                    </a>
                    {item.scope === 'service' && (
                      <span className="text-muted-foreground">仅提醒，不自动停服或删除</span>
                    )}
                  </div>
                  <History id={item.id} />
                </article>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>共 {result.data.total} 项</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 30))}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + 30 >= result.data.total}
                onClick={() => setOffset(offset + 30)}
              >
                下一页
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
function History({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const result = useQuery({
    queryKey: ['hosting-incident-history', id],
    queryFn: () =>
      apiClient(
        'GET /v1/admin/hosting/incidents/:incidentId/events',
        `/v1/admin/hosting/incidents/${id}/events`,
      ),
    enabled: open,
  });
  return (
    <details className="border-t pt-2 text-xs" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer">查看最近 100 条状态变化</summary>
      {open &&
        (result.isError ? (
          <p role="alert">历史读取失败</p>
        ) : result.isPending ? (
          <p>正在读取…</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {result.data.items.map((e) => (
              <li key={e.id}>
                {formatTime(e.observedAt)} ·{' '}
                {e.kind === 'opened'
                  ? '发现异常'
                  : e.kind === 'recovered'
                    ? '确认恢复'
                    : '资源已退出监测'}
              </li>
            ))}
          </ul>
        ))}
    </details>
  );
}
