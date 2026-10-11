import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  addDeploymentDomain,
  listDeploymentDomains,
  removeDeploymentDomain,
  verifyDeploymentDomain,
} from '@/api/user';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function DeploymentDomains({ deploymentId }: { deploymentId: string }) {
  const [hostname, setHostname] = useState('');
  const client = useQueryClient();
  const key = ['deployment-domains', deploymentId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => listDeploymentDomains(deploymentId),
    refetchInterval: 15000,
  });
  const action = useMutation({
    mutationFn: async (input: { kind: 'add' | 'verify' | 'remove'; id?: string }) => {
      await (input.kind === 'add'
        ? addDeploymentDomain(deploymentId, hostname)
        : input.kind === 'verify'
          ? verifyDeploymentDomain(deploymentId, input.id!)
          : removeDeploymentDomain(deploymentId, input.id!));
    },
    onSuccess: () => {
      setHostname('');
      void client.invalidateQueries({ queryKey: key });
    },
    onError: (error) => toast.error(error.message),
  });
  const labels = {
    pending_dns: '等待解析验证',
    pending_tls: '正在配置 HTTPS',
    ready: '已生效',
    removing: '正在解绑',
  };
  return (
    <section className="space-y-3 rounded-lg border border-border p-4" aria-label="自定义域名管理">
      <h3 className="font-semibold">自定义域名</h3>
      <p className="text-sm text-muted-foreground">
        添加自己的域名，按提示配置一次解析。平台自动验证并申请 HTTPS 证书，默认地址继续可用。
      </p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          action.mutate({ kind: 'add' });
        }}
      >
        <Input
          aria-label="自定义域名"
          placeholder="app.example.com"
          value={hostname}
          onChange={(event) => setHostname(event.target.value)}
        />
        <Button type="submit" disabled={action.isPending || !hostname.trim()}>
          添加
        </Button>
      </form>
      {query.isError ? <p role="alert">域名列表加载失败，请稍后重试。</p> : null}
      {query.data?.items.map((domain) => (
        <div key={domain.id} className="space-y-2 rounded border border-border p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <strong>{domain.hostname}</strong>
            <span>{labels[domain.state]}</span>
          </div>
          {domain.accessUrl ? (
            <a href={domain.accessUrl} target="_blank" rel="noreferrer" className="underline">
              访问应用
            </a>
          ) : null}
          {domain.state !== 'removing' ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th>类型</th>
                      <th>名称（完整域名）</th>
                      <th>记录值</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>CNAME</td>
                      <td>{domain.hostname}</td>
                      <td>{domain.cnameTarget}</td>
                    </tr>
                    <tr>
                      <td>TXT</td>
                      <td>{domain.verificationName}</td>
                      <td className="font-mono break-all">{domain.verificationValue}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground">
                若绑定根域名且服务商不支持根域名 CNAME，请改用 A 记录指向{' '}
                {domain.ipv4Target ?? '联系平台获取入口地址'}。TXT 记录仍需保留。主机记录按 DNS
                服务商要求填写相对名称。
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ kind: 'verify', id: domain.id })}
                >
                  检查解析
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() => {
                    if (window.confirm('解绑后此域名将停止访问该实例，默认地址不受影响。继续？'))
                      action.mutate({ kind: 'remove', id: domain.id });
                  }}
                >
                  解绑
                </Button>
              </div>
            </>
          ) : (
            <p>等待服务器移除入口，完成后可绑定到其他实例。</p>
          )}
        </div>
      ))}
    </section>
  );
}
