import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatTime } from '@/lib/utils';

export function HostingPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [serverIp, setServerIp] = useState('');
  const [cpu, setCpu] = useState('2');
  const [memory, setMemory] = useState('4096');
  const [disk, setDisk] = useState('20480');
  const [credential, setCredential] = useState<{ id: string; token: string } | null>(null);
  const nodes = useQuery({
    queryKey: ['hosting-nodes'],
    queryFn: () => apiClient('GET /v1/admin/hosting/nodes', '/v1/admin/hosting/nodes'),
    refetchInterval: 15000,
  });
  const create = useMutation({
    mutationFn: () =>
      apiClient('POST /v1/admin/hosting/nodes', '/v1/admin/hosting/nodes', {
        body: JSON.stringify({
          name,
          serverIp,
          capacity: {
            cpuMillis: Number(cpu) * 1000,
            memoryMb: Number(memory),
            diskMb: Number(disk),
          },
        }),
      }),
    onSuccess: (result) => {
      setCredential({ id: result.node.id, token: result.reportToken });
      void qc.invalidateQueries({ queryKey: ['hosting-nodes'] });
      toast.success('节点已登记，默认暂停分配');
    },
    onError: (error) => toast.error(error.message),
  });
  const change = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiClient(
        'PATCH /v1/admin/hosting/nodes/:param',
        `/v1/admin/hosting/nodes/${encodeURIComponent(id)}`,
        { body: JSON.stringify({ enabled }) },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hosting-nodes'] });
      toast.success('节点分配状态已更新');
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">托管服务器</h1>
        <p className="text-muted-foreground">
          登记可分配容量并接入健康报告。只分配已启用、报告新鲜且资源充足的节点。
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>登记节点</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            填写扣除系统与现有应用占用后的可分配预算。每个节点只登记一次，当前阶段仅预留容量，不执行远程部署。
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="hosting-name">节点名称</Label>
              <Input id="hosting-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="hosting-ip">服务器 IP</Label>
              <Input
                id="hosting-ip"
                value={serverIp}
                onChange={(e) => setServerIp(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="hosting-cpu">可分配 CPU 核数</Label>
              <Input
                id="hosting-cpu"
                type="number"
                min="0.1"
                step="0.1"
                value={cpu}
                onChange={(e) => setCpu(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="hosting-memory">可分配内存 MiB</Label>
              <Input
                id="hosting-memory"
                type="number"
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="hosting-disk">可分配磁盘 MiB</Label>
              <Input
                id="hosting-disk"
                type="number"
                value={disk}
                onChange={(e) => setDisk(e.target.value)}
              />
            </div>
          </div>
          <Button
            disabled={create.isPending || !name.trim() || !serverIp.trim()}
            onClick={() => create.mutate()}
          >
            登记服务器
          </Button>
          {credential ? (
            <div className="space-y-2 rounded border p-3">
              <p>健康上报凭据仅显示一次，请保存到节点上权限为 600 的探针配置文件。</p>
              <p className="font-mono break-all">节点 ID：{credential.id}</p>
              <p className="font-mono break-all">reportToken：{credential.token}</p>
              <p className="text-sm">
                使用仓库 scripts/hosting-node-report.py 定时上报，确认报告正常后启用分配。
              </p>
              <Button variant="outline" onClick={() => setCredential(null)}>
                已保存，隐藏凭据
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {nodes.isError ? <p role="alert">{nodes.error.message}</p> : null}
      {nodes.isPending ? <p>正在读取节点…</p> : null}
      {nodes.data?.items.length === 0 ? (
        <p>尚未登记托管服务器。客户申请会保留为等待资源。</p>
      ) : null}
      {nodes.data?.items.map((node) => (
        <Card key={node.id}>
          <CardHeader>
            <CardTitle>
              {node.name} · {node.serverIp}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              {node.enabled ? '允许分配' : '暂停分配'} ·{' '}
              {node.healthy ? '报告正常' : '报告缺失、过期或节点不可用'}
            </p>
            <p>
              预算：{node.capacity.cpuMillis / 1000} 核 / {node.capacity.memoryMb} MiB 内存 /{' '}
              {node.capacity.diskMb} MiB 磁盘
            </p>
            <p>
              已预留：{(node.reserved.cpuMillis ?? 0) / 1000} 核 / {node.reserved.memoryMb ?? 0} MiB
              内存 / {node.reserved.diskMb ?? 0} MiB 磁盘
            </p>
            <p>最近报告：{node.lastReportedAt ? formatTime(node.lastReportedAt) : '未上报'}</p>
            <Button
              variant="outline"
              disabled={change.isPending}
              onClick={() => change.mutate({ id: node.id, enabled: !node.enabled })}
            >
              {node.enabled ? '暂停新分配' : '启用分配'}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
