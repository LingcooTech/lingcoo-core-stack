import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { handoverCommandSchema } from '@lingcoo/contracts';
import type { z } from 'zod';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatTime } from '@/lib/utils';
type Command = z.infer<typeof handoverCommandSchema>;
export function HostingHandoverPanel({
  deploymentId,
  version,
  completed,
  admin,
  canManage,
}: {
  deploymentId: string;
  version: number;
  completed: boolean;
  admin: boolean;
  canManage: boolean;
}) {
  const path = `/v1/${admin ? 'admin/' : ''}deployments/${deploymentId}/handover`,
    qc = useQueryClient();
  const pending = useRef<{ kind: string; key: string } | null>(null);
  const [download, setDownload] = useState<{ url: string; expiresAt: string } | null>(null);
  const query = useQuery({
    queryKey: ['hosting-handover', deploymentId, admin],
    queryFn: () =>
      admin
        ? apiClient('GET /v1/admin/deployments/:deploymentId/handover', path)
        : apiClient('GET /v1/deployments/:deploymentId/handover', path),
    refetchInterval: 15000,
  });
  const mutation = useMutation({
    mutationFn: (command: Command) =>
      admin
        ? apiClient('POST /v1/admin/deployments/:deploymentId/handover', path, {
            body: JSON.stringify(command),
          })
        : apiClient('POST /v1/deployments/:deploymentId/handover', path, {
            body: JSON.stringify(command),
          }),
    onSuccess: (result, command) => {
      pending.current = null;
      void qc.invalidateQueries({ queryKey: ['hosting-handover', deploymentId] });
      void qc.invalidateQueries({ queryKey: ['hosting-exit', deploymentId] });
      void qc.invalidateQueries({ queryKey: ['hosting-overview'] });
      if (result.downloadPath && result.expiresAt)
        setDownload({ url: result.downloadPath, expiresAt: result.expiresAt });
      if (result.identity && command.kind === 'key') {
        const url = URL.createObjectURL(new Blob([result.identity + '\n'], { type: 'text/plain' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = command.handoverId + '.key.txt';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    },
  });
  function request(kind: 'prepare' | 'reclaim') {
    if (pending.current?.kind !== kind) pending.current = { kind, key: crypto.randomUUID() };
    mutation.mutate({
      kind,
      requestKey: pending.current.key,
      expectedVersion: version,
      ...(kind === 'reclaim' ? { confirmDeploymentId: deploymentId } : {}),
    } as Command);
  }
  const reclamation = query.data?.reclamation;
  return (
    <section className="space-y-3 border-t pt-3" aria-label="加密数据交付与资源回收">
      <h4 className="font-medium">加密数据交付</h4>
      <p className="text-xs text-muted-foreground">
        交付包有效期 7 天。客户需分别保存加密数据包和独立解密密钥；领取的下载授权 10
        分钟内有效且仅可使用一次，下载中断可重新领取。
      </p>
      {query.isPending ? (
        <p>正在读取交付包…</p>
      ) : query.isError ? (
        <p role="alert">{query.error.message}</p>
      ) : (
        <>
          {!query.data.items.length && <p>尚未制作交付包</p>}
          {query.data.items.map((item) => {
            const valid = item.state === 'ready' && Date.parse(item.expiresAt) > Date.now();
            return (
              <div key={item.id} className="space-y-2 rounded-md border p-3">
                <p>
                  {item.state === 'revoked'
                    ? '已撤销'
                    : Date.parse(item.expiresAt) <= Date.now()
                      ? '已过期'
                      : item.state === 'ready'
                        ? '可下载'
                        : '制作与传输中'}{' '}
                  · {item.size ? `${(item.size / 1048576).toFixed(1)} MiB` : '等待节点'}
                </p>
                <p className="text-xs">有效至：{formatTime(item.expiresAt)}</p>
                {item.sha256 && (
                  <p className="text-xs break-all text-muted-foreground">SHA256：{item.sha256}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {!admin && valid && !reclamation && (
                    <>
                      <Button
                        variant="outline"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ kind: 'grant', handoverId: item.id })}
                      >
                        领取下载授权
                      </Button>
                      <Button
                        variant="outline"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ kind: 'key', handoverId: item.id })}
                      >
                        单独下载解密密钥
                      </Button>
                    </>
                  )}
                  {canManage && valid && (
                    <Button
                      variant="outline"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ kind: 'revoke', handoverId: item.id })}
                    >
                      撤销此交付包
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {canManage && !reclamation && (
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => request('prepare')}
            >
              制作加密交付包
            </Button>
          )}
        </>
      )}
      {download && !admin && (
        <p>
          <a className="text-primary underline" href={download.url}>
            下载加密数据包
          </a>
          <span className="ml-2 text-xs">有效至 {formatTime(download.expiresAt)}</span>
        </p>
      )}
      {!admin && (
        <details>
          <summary className="cursor-pointer">如何使用交付文件</summary>
          <p className="mt-2 text-xs">
            请妥善分开保管两个文件。可交给接管运维人员，使用 age 工具与密钥解密，核对 SHA256SUMS
            后恢复到独立环境。交付包包含数据库卷、应用文件和原配置；数据库恢复需使用兼容版本。
          </p>
        </details>
      )}
      {reclamation ? (
        <p>
          {reclamation.state === 'completed'
            ? '本地实例资源已回收；异机备份按原政策保留。'
            : '资源回收处理中；节点未确认前继续保留资源预算。'}
        </p>
      ) : (
        canManage &&
        completed && (
          <form
            className="space-y-2 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (f.get('confirm') === deploymentId) request('reclaim');
            }}
          >
            <h4 className="font-medium">回收本地实例资源</h4>
            <p className="text-xs">
              保留期届满后可删除此实例的容器、数据卷和部署目录。存在未结束工单、运维任务或有效交付包时会拒绝；不会删除其他实例、共享镜像、证书和异机备份。
            </p>
            <label className="block text-xs">
              输入实例编号确认：<span className="break-all">{deploymentId}</span>
              <Input name="confirm" required pattern={deploymentId} autoComplete="off" />
            </label>
            <Button variant="destructive" disabled={mutation.isPending}>
              确认回收本地资源
            </Button>
          </form>
        )
      )}
      {mutation.isError && (
        <p role="alert" className="text-destructive">
          {mutation.error.message}
        </p>
      )}
    </section>
  );
}
