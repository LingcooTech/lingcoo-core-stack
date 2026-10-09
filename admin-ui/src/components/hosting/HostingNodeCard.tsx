import { useState } from 'react';
import type { HostingNode } from '@lingcoo/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Server, ShieldCheck, ChevronRight, Settings2, Box, Clock3 } from 'lucide-react';
import { StatusPill } from '@/components/shared/StatusPill';
import { ResourceMeter } from './HostingVisuals';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { formatTime } from '@/lib/utils';

export function HostingNodeCard({ node }: { node: HostingNode }) {
  const qc = useQueryClient();
  const [details, setDetails] = useState(false);
  const [containerSearch, setContainerSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: node.name,
    provider: node.asset.provider,
    region: node.asset.region,
    purpose: node.asset.purpose,
    notes: node.asset.notes,
    cost: node.asset.monthlyCostCents === null ? '' : String(node.asset.monthlyCostCents / 100),
    expires: node.asset.expiresAt
      ? new Date(node.asset.expiresAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
      : '',
    cpu: String(node.capacity.cpuMillis / 1000),
    memory: String(node.capacity.memoryMb),
    disk: String(node.capacity.diskMb),
  });
  const change = useMutation({
    mutationFn: (payload: object) =>
      apiClient('PATCH /v1/admin/hosting/nodes/:param', `/v1/admin/hosting/nodes/${node.id}`, {
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hosting-nodes'] });
      setEditing(false);
      toast.success('节点配置已保存');
    },
    onError: (e) => toast.error(e.message),
  });
  const save = () =>
    change.mutate({
      name: draft.name,
      capacity: {
        cpuMillis: Number(draft.cpu) * 1000,
        memoryMb: Number(draft.memory),
        diskMb: Number(draft.disk),
      },
      asset: {
        provider: draft.provider,
        region: draft.region,
        purpose: draft.purpose,
        notes: draft.notes,
        monthlyCostCents: draft.cost === '' ? null : Math.round(Number(draft.cost) * 100),
        expiresAt: draft.expires ? new Date(draft.expires + 'T00:00:00+08:00').toISOString() : null,
      },
    });
  const totals = node.telemetry?.totals;
  const containers = node.telemetry?.containers ?? [];
  const filtered = containers.filter((c) =>
    `${c.name} ${c.project} ${c.service}`.toLowerCase().includes(containerSearch.toLowerCase()),
  );
  const certificate = node.telemetry?.certificate;
  const issuer = node.telemetry?.certificateAutomation;
  const openEditor = () => {
    setDraft({
      name: node.name,
      provider: node.asset.provider,
      region: node.asset.region,
      purpose: node.asset.purpose,
      notes: node.asset.notes,
      cost: node.asset.monthlyCostCents === null ? '' : String(node.asset.monthlyCostCents / 100),
      expires: node.asset.expiresAt
        ? new Date(node.asset.expiresAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
        : '',
      cpu: String(node.capacity.cpuMillis / 1000),
      memory: String(node.capacity.memoryMb),
      disk: String(node.capacity.diskMb),
    });
    setEditing(true);
  };
  return (
    <>
      <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="flex items-start gap-3 p-5 pb-4">
          <div className="rounded-lg border bg-muted/40 p-2.5 text-muted-foreground">
            <Server className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm leading-6 font-semibold">{node.name}</h3>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{node.serverIp}</p>
          </div>
          <StatusPill
            tone={node.healthy ? 'ok' : 'danger'}
            label={node.healthy ? '在线' : '报告异常'}
          />
        </div>
        <div className="flex-1 space-y-5 px-5 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              tone={node.telemetry?.canDeploy ? 'info' : 'neutral'}
              label={node.telemetry?.canDeploy ? '托管节点' : '仅监控'}
            />
            <StatusPill
              tone={node.enabled ? 'ok' : 'neutral'}
              label={node.enabled ? '允许新分配' : '暂停新分配'}
            />
            <span className="text-xs text-muted-foreground">
              {[node.asset.provider, node.asset.region].filter(Boolean).join(' · ') ||
                '资产信息待完善'}
            </span>
          </div>
          <p className="text-xs break-words text-muted-foreground">
            应用适配：
            {node.telemetry?.supportedApps?.join('、') ||
              (node.telemetry?.supportedApps ? '尚无已验证适配器' : '旧节点协议，仅兼容 Retail')}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <ResourceMeter
              label="内存使用"
              value={
                totals && node.available
                  ? Math.max(0, totals.memoryMb - node.available.memoryMb)
                  : null
              }
              total={totals?.memoryMb ?? null}
            />
            <ResourceMeter
              label="磁盘使用"
              value={
                totals && node.available
                  ? Math.max(0, totals.diskMb - node.available.diskMb) / 1024
                  : null
              }
              total={totals ? totals.diskMb / 1024 : null}
              unit="GiB"
            />
          </div>
          <div className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs">
            <span className="text-muted-foreground">托管内存预留</span>
            <span className="font-medium tabular-nums">
              {node.reserved.memoryMb} / {node.capacity.memoryMb} MiB
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {certificate?.domain ?? (issuer ? '集中证书签发' : '网关证书')}
            </span>
            <StatusPill
              tone={
                node.alerts.some((a) => a.code.startsWith('certificate'))
                  ? 'warn'
                  : certificate || issuer?.status === 'success'
                    ? 'ok'
                    : 'neutral'
              }
              label={
                node.alerts.some((a) => a.code.startsWith('certificate'))
                  ? '需检查'
                  : certificate
                    ? '已加载'
                    : issuer?.status === 'success'
                      ? '正常'
                      : '未配置'
              }
            />
          </div>
          {node.alerts.length ? (
            <div
              role="alert"
              className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
            >
              {node.alerts[0]?.message}
              {node.alerts.length > 1 ? `，另有 ${node.alerts.length - 1} 项提醒` : ''}
            </div>
          ) : null}
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock3 className="size-3" />
            {node.lastReportedAt
              ? `最近上报 ${formatTime(node.lastReportedAt)}`
              : '等待节点首次上报'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground"
            onClick={openEditor}
          >
            <Settings2 className="size-3.5" />
            编辑资产与预算
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDetails(true)}>
            查看详情
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </article>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑资产与预算</DialogTitle>
            <DialogDescription>
              {node.serverIp} · 预算是允许分配的上限，不是实际占用。
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ['name', '节点名称'],
                  ['provider', '云厂商'],
                  ['region', '地域'],
                  ['purpose', '用途'],
                  ['cost', '月成本（元，可留空）'],
                  ['expires', '到期日期'],
                  ['cpu', '托管 CPU 预算（核）'],
                  ['memory', '托管内存预算（MiB）'],
                  ['disk', '托管磁盘预算（MiB）'],
                  ['notes', '备注'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label htmlFor={`${node.id}-${key}`}>{label}</Label>
                  <Input
                    id={`${node.id}-${key}`}
                    type={
                      key === 'expires'
                        ? 'date'
                        : ['cost', 'cpu', 'memory', 'disk'].includes(key)
                          ? 'number'
                          : 'text'
                    }
                    step="any"
                    required={['name', 'cpu', 'memory', 'disk'].includes(key)}
                    min={
                      key === 'cpu'
                        ? 0.1
                        : key === 'memory'
                          ? Math.max(128, node.reserved.memoryMb)
                          : key === 'disk'
                            ? Math.max(1024, node.reserved.diskMb)
                            : key === 'cost'
                              ? 0
                              : undefined
                    }
                    value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div>
                <Button type="submit" disabled={change.isPending}>
                  保存节点配置
                </Button>
              </div>
            </div>
          </form>
          {change.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {change.error.message}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
      <Sheet open={details} onOpenChange={setDetails}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="border-b p-6">
            <SheetTitle>{node.name}</SheetTitle>
            <SheetDescription>{node.serverIp} · 服务器详情</SheetDescription>
          </SheetHeader>
          <div className="space-y-6 px-6 pb-8">
            {node.alerts.length ? (
              <div className="space-y-2 rounded-lg bg-amber-500/10 p-4">
                {node.alerts.map((a) => (
                  <p role="alert" key={a.code} className="text-sm">
                    {a.message}
                  </p>
                ))}
              </div>
            ) : null}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">资产与容量</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {[
                  ['用途', node.asset.purpose || '待填写'],
                  [
                    '月成本',
                    node.asset.monthlyCostCents === null
                      ? '待填写'
                      : `¥${(node.asset.monthlyCostCents / 100).toFixed(2)}`,
                  ],
                  ['到期日期', node.asset.expiresAt ? formatTime(node.asset.expiresAt) : '待填写'],
                  [
                    'CPU / 系统负载',
                    `${totals ? totals.cpuMillis / 1000 : '—'} 核 / ${node.telemetry?.load1?.toFixed(2) ?? '—'}`,
                  ],
                  ['托管 CPU 预算', `${node.capacity.cpuMillis / 1000} 核`],
                  ['托管磁盘预算', `${(node.capacity.diskMb / 1024).toFixed(1)} GiB`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="mb-1 text-xs text-muted-foreground">{label}</dt>
                    <dd className="break-words">{value}</dd>
                  </div>
                ))}
              </dl>
              {node.asset.notes ? (
                <p className="text-xs text-muted-foreground">{node.asset.notes}</p>
              ) : null}
              <Button
                variant="outline"
                disabled={
                  change.isPending || (!node.enabled && node.telemetry?.canDeploy === false)
                }
                onClick={() => change.mutate({ enabled: !node.enabled })}
              >
                {node.enabled ? '暂停新分配' : '启用分配'}
              </Button>
              <p className="text-xs text-muted-foreground">
                {node.telemetry?.canDeploy === false
                  ? '该节点仅监控，配置部署执行器后才能启用分配。'
                  : '暂停新分配后，现有实例和备份继续运行。'}
              </p>
            </section>
            <section className="space-y-2 border-t pt-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="size-4" />
                证书管理
              </h3>
              {certificate ? (
                <p className="text-sm">
                  {certificate.domain}
                  <span className="block text-xs text-muted-foreground">
                    到期 {formatTime(certificate.expiresAt)}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {issuer ? '此节点负责集中签发，入口证书加载在托管网关。' : '尚未加载网关证书。'}
                </p>
              )}
              {issuer ? (
                <p className="text-xs text-muted-foreground">
                  签发与分发：{issuer.status === 'success' ? '正常' : '失败'} ·{' '}
                  {formatTime(issuer.checkedAt)}
                </p>
              ) : null}
            </section>
            <section className="space-y-3 border-t pt-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Box className="size-4" />
                容器资源清单 <span className="text-muted-foreground">{containers.length}</span>
              </h3>
              <p className="text-xs text-muted-foreground">既有非平台应用仅展示运行信息。</p>
              <Input
                aria-label="搜索容器"
                placeholder="搜索容器、服务或项目"
                value={containerSearch}
                onChange={(e) => setContainerSearch(e.target.value)}
              />
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[480px] text-left text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="p-3">容器 / 项目</th>
                      <th className="p-3">状态</th>
                      <th className="p-3">内存</th>
                      <th className="p-3">CPU</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.name} className="border-t">
                        <td className="max-w-[240px] p-3 break-all">
                          <p className="font-medium">{c.name}</p>
                          <p className="mt-1 text-muted-foreground">
                            {c.project || '独立容器'} · 重启 {c.restarts} 次
                          </p>
                        </td>
                        <td className="p-3">
                          <StatusPill
                            tone={
                              c.state !== 'running'
                                ? 'neutral'
                                : c.health === 'unhealthy'
                                  ? 'danger'
                                  : 'ok'
                            }
                            label={
                              c.state !== 'running'
                                ? '已停止'
                                : c.health === 'unhealthy'
                                  ? '不健康'
                                  : '运行中'
                            }
                          />
                        </td>
                        <td className="p-3 whitespace-nowrap tabular-nums">
                          {c.memoryMb.toFixed(1)} MiB
                        </td>
                        <td className="p-3 tabular-nums">{c.cpuPercent.toFixed(1)}%</td>
                      </tr>
                    ))}
                    {!filtered.length ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-muted-foreground">
                          没有匹配的容器记录
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
