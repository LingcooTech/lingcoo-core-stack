import { useState } from 'react';
import type { HostingNode } from '@lingcoo/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatTime } from '@/lib/utils';

export function HostingNodeCard({ node }: { node: HostingNode }) {
  const qc = useQueryClient();
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {node.name} · {node.serverIp}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p>
          {node.healthy ? '在线' : '报告缺失或节点异常'} ·{' '}
          {node.enabled ? '允许新分配' : '暂停新分配'} ·{' '}
          {node.telemetry?.canDeploy ? '部署执行器' : '仅监控或待接入'}
        </p>
        <p className="text-sm text-muted-foreground">
          {[node.asset.provider, node.asset.region, node.asset.purpose]
            .filter(Boolean)
            .join(' · ') || '尚未填写资产信息'}{' '}
          · 月成本：
          {node.asset.monthlyCostCents === null
            ? '待填写'
            : `¥${(node.asset.monthlyCostCents / 100).toFixed(2)}`}{' '}
          · 到期：{node.asset.expiresAt ? formatTime(node.asset.expiresAt) : '待填写'}
        </p>
        <p>
          总资源：
          {node.telemetry?.totals
            ? `${node.telemetry.totals.cpuMillis / 1000} 核 / ${node.telemetry.totals.memoryMb} MiB / ${(node.telemetry.totals.diskMb / 1024).toFixed(1)} GiB`
            : '待上报'}
        </p>
        <p>
          实际可用：
          {node.available
            ? `${node.available.memoryMb} MiB 内存 / ${(node.available.diskMb / 1024).toFixed(1)} GiB 磁盘`
            : '待上报'}{' '}
          · 系统负载：{node.telemetry?.load1?.toFixed(2) ?? '未知'}
        </p>
        <p>
          托管预算：{node.capacity.cpuMillis / 1000} 核 / {node.capacity.memoryMb} MiB /{' '}
          {(node.capacity.diskMb / 1024).toFixed(1)} GiB；已预留 {node.reserved.memoryMb} MiB 内存
        </p>
        <p>最近报告：{node.lastReportedAt ? formatTime(node.lastReportedAt) : '未上报'}</p>
        <p>
          通配符证书：
          {node.telemetry?.certificate
            ? `${node.telemetry.certificate.domain}，到期 ${formatTime(node.telemetry.certificate.expiresAt)}`
            : '此节点尚未加载'}
        </p>
        {node.telemetry?.certificateAutomation ? (
          <p>
            证书签发与分发：
            {node.telemetry.certificateAutomation.status === 'success' ? '正常' : '失败'} · 最近检查{' '}
            {formatTime(node.telemetry.certificateAutomation.checkedAt)}
          </p>
        ) : null}
        {node.alerts.map((a) => (
          <p
            role="alert"
            key={a.code}
            className={a.severity === 'critical' ? 'text-destructive' : 'text-amber-700'}
          >
            {a.message}
          </p>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={change.isPending || (!node.enabled && node.telemetry?.canDeploy === false)}
            onClick={() => change.mutate({ enabled: !node.enabled })}
          >
            {node.enabled ? '暂停新分配' : '启用分配'}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setEditing(!editing);
            }}
          >
            {editing ? '取消编辑' : '编辑资产与预算'}
          </Button>
        </div>
        {editing ? (
          <div className="grid gap-3 rounded border p-4 md:grid-cols-3">
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
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </div>
            ))}
            <div>
              <Button onClick={save} disabled={change.isPending}>
                保存节点配置
              </Button>
            </div>
          </div>
        ) : null}
        <details>
          <summary className="cursor-pointer">
            容器资源清单（{node.telemetry?.containers?.length ?? 0}）
          </summary>
          <p className="my-2 text-sm text-muted-foreground">已有非平台应用只读展示，不自动接管。</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th>容器 / 项目</th>
                  <th>运行 / 健康</th>
                  <th>内存</th>
                  <th>CPU</th>
                  <th>重启次数</th>
                </tr>
              </thead>
              <tbody>
                {node.telemetry?.containers?.map((c) => (
                  <tr key={c.name} className="border-t">
                    <td className="py-2">
                      {c.name}
                      <div className="text-muted-foreground">{c.project || '独立容器'}</div>
                    </td>
                    <td>
                      {c.state} / {c.health}
                    </td>
                    <td>{c.memoryMb.toFixed(1)} MiB</td>
                    <td>{c.cpuPercent.toFixed(1)}%</td>
                    <td>{c.restarts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
