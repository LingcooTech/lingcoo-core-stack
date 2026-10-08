import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
export function AddHostingNode() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [serverIp, setServerIp] = useState('');
  const [cpu, setCpu] = useState('2');
  const [memory, setMemory] = useState('1024');
  const [disk, setDisk] = useState('20480');
  const [credential, setCredential] = useState<{ id: string; token: string } | null>(null);
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
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && (credential || create.isPending)) {
          toast.info('请先保存节点凭据，再关闭窗口');
          return;
        }
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          添加服务器
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>添加服务器资源</DialogTitle>
          <DialogDescription>登记节点并接入上报后，再启用托管分配。</DialogDescription>
        </DialogHeader>
        <div>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              填写扣除系统与现有应用占用后的可分配预算。每个节点只登记一次；接入执行器并启用分配后，平台可以自动部署。
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
              disabled={create.isPending || !!credential || !name.trim() || !serverIp.trim()}
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
                <Button
                  variant="outline"
                  onClick={() => {
                    setCredential(null);
                    setOpen(false);
                  }}
                >
                  已保存，隐藏凭据
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
