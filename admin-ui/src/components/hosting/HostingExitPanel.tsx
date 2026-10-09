import { HostingHandoverPanel } from './HostingHandoverPanel';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hostingExitCommandSchema, type HostingExitCommand } from '@lingcoo/contracts';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';
import { formatTime } from '@/lib/utils';
const names = {
  requested: '等待运维处理',
  withdrawn: '已撤回退出',
  stopping: '停服与备份中',
  retained: '数据保留中',
  completed: '交接已确认',
};
export function HostingExitPanel({
  deploymentId,
  admin = false,
}: {
  deploymentId: string;
  admin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const canManage = admin && hasPermission(normalizeRole(user?.role), 'settings.manage');
  const qc = useQueryClient();
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const [validation, setValidation] = useState('');
  const path = `/v1/${admin ? 'admin/' : ''}deployments/${deploymentId}/hosting-exit`;
  const query = useQuery({
    queryKey: ['hosting-exit', deploymentId, admin],
    enabled: open,
    queryFn: () =>
      admin
        ? apiClient('GET /v1/admin/deployments/:deploymentId/hosting-exit', path)
        : apiClient('GET /v1/deployments/:deploymentId/hosting-exit', path),
    refetchInterval: open ? 15000 : false,
  });
  const mutation = useMutation({
    mutationFn: (input: HostingExitCommand) =>
      admin
        ? apiClient('POST /v1/admin/deployments/:deploymentId/hosting-exit', path, {
            body: JSON.stringify(input),
          })
        : apiClient('POST /v1/deployments/:deploymentId/hosting-exit', path, {
            body: JSON.stringify(input),
          }),
    onSuccess: () => {
      pending.current = null;
      void qc.invalidateQueries({ queryKey: ['hosting-exit', deploymentId] });
      void qc.invalidateQueries({ queryKey: ['hosting-overview'] });
    },
  });
  const exit = query.data?.exit;
  function submit(kind: string, form: FormData) {
    const fields = {
      kind,
      ...(kind === 'request' ? { reason: form.get('reason') } : { expectedVersion: exit?.version }),
      ...(kind === 'start' ? { retentionDays: Number(form.get('retentionDays')) } : {}),
      ...(kind === 'handover' ? { reference: form.get('reference') } : {}),
    };
    const fingerprint = JSON.stringify(fields);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    const parsed = hostingExitCommandSchema.safeParse({
      ...fields,
      requestKey: pending.current.key,
    });
    if (!parsed.success) {
      setValidation('请填写完整信息：原因/交接说明至少 5 字，保留期为 1–3650 天。');
      return;
    }
    setValidation('');
    mutation.mutate(parsed.data);
  }
  const kind =
    !exit || exit.state === 'withdrawn'
      ? 'request'
      : canManage && exit.state === 'requested'
        ? 'start'
        : canManage && exit.state === 'retained'
          ? 'handover'
          : !admin && exit.state === 'retained' && exit.handoverReference
            ? 'acknowledge'
            : null;
  return (
    <details
      className="rounded-lg border p-4 text-sm"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">服务退出与数据交接</summary>
      <div className="mt-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          申请后暂停续费及重启。运维确认后停止服务、保存数据及异机备份；不会自动删除数据或退款。
        </p>
        {query.isPending ? (
          <p>正在读取退出记录…</p>
        ) : query.isError ? (
          <p role="alert">
            {query.error.message}
            <Button variant="ghost" onClick={() => void query.refetch()}>
              重试
            </Button>
          </p>
        ) : (
          <>
            {exit ? (
              <>
                <p className="font-medium">{names[exit.state]}</p>
                <p className="break-all">原因：{exit.reason}</p>
                {exit.retainUntil && <p>数据至少保留至：{formatTime(exit.retainUntil)}</p>}
                {exit.evidence && (
                  <p className="text-xs break-all">
                    停服与异机备份已验证。备份校验：{exit.evidence.manifestSha256}
                  </p>
                )}
                {exit.handoverReference && (
                  <p className="break-all">交接说明：{exit.handoverReference}</p>
                )}
                {exit.state === 'stopping' && (
                  <p>等待节点确认；离线或备份失败时保留资源，并以同一任务重试。</p>
                )}
                {exit.state === 'completed' && (
                  <p>服务已结束；如需退款，由财务独立审核金额。保留数据仍占用磁盘。</p>
                )}
              </>
            ) : (
              <p>尚未申请退出</p>
            )}
            {!admin && exit?.state === 'requested' && (
              <div>
                <p>停服任务提交前可撤回，恢复当前服务的续费和运维入口。</p>
                <Button
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => submit('withdraw', new FormData())}
                >
                  撤回退出申请
                </Button>
                {mutation.isError && <p role="alert">{mutation.error.message}</p>}
              </div>
            )}
            {kind && (!admin || canManage) && (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(kind, new FormData(e.currentTarget));
                }}
              >
                {kind === 'request' && (
                  <label className="block">
                    退出原因
                    <Input name="reason" required minLength={5} maxLength={500} />
                  </label>
                )}
                {kind === 'start' && (
                  <>
                    <label className="block">
                      数据保留天数
                      <Input
                        name="retentionDays"
                        type="number"
                        required
                        min={1}
                        max={3650}
                        placeholder="不得短于购买约定"
                      />
                    </label>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" required />
                      确认停止此实例全部服务；完成备份后保留数据。
                    </label>
                  </>
                )}
                {kind === 'handover' && (
                  <label className="block">
                    数据交接说明
                    <Input
                      name="reference"
                      required
                      minLength={5}
                      maxLength={500}
                      placeholder="交接工单或交付凭证，不填写密钥或下载口令"
                    />
                  </label>
                )}
                {kind === 'acknowledge' && (
                  <label className="flex items-start gap-2">
                    <input type="checkbox" required />
                    我已收到并核对交接数据，确认结束托管服务。
                  </label>
                )}
                {(validation || mutation.isError) && (
                  <p role="alert" className="text-destructive">
                    {validation || mutation.error?.message}
                  </p>
                )}
                <Button
                  variant={kind === 'start' ? 'destructive' : 'outline'}
                  disabled={mutation.isPending}
                >
                  {mutation.isPending
                    ? '提交中…'
                    : kind === 'request'
                      ? '申请退出'
                      : kind === 'start'
                        ? '确认停服并备份'
                        : kind === 'handover'
                          ? '登记数据交接'
                          : '确认收到数据'}
                </Button>
              </form>
            )}
            {exit && ['retained', 'completed'].includes(exit.state) && (
              <HostingHandoverPanel
                deploymentId={deploymentId}
                version={exit.version}
                completed={exit.state === 'completed'}
                admin={admin}
                canManage={canManage}
              />
            )}
            {query.data?.events.length ? (
              <ol className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
                {query.data.events.map((event, i) => (
                  <li key={i}>
                    {formatTime(event.createdAt)} ·{' '}
                    {(
                      {
                        request: '申请退出',
                        withdraw: '客户撤回退出',
                        start: '提交停服任务',
                        node_confirmed: '节点确认停服与备份',
                        handover: '登记数据交接',
                        acknowledge: '客户确认交接',
                        export_requested: '请求制作交付包',
                        handover_ready: '加密交付包已验证',
                        handover_key_received: '客户领取独立解密密钥',
                        handover_download_granted: '签发短时下载授权',
                        handover_download_started: '客户开始下载',
                        handover_revoked: '交付包已撤销',
                        reclaim_requested: '运维提交资源回收',
                        reclaimed: '节点确认资源回收',
                      } as Record<string, string>
                    )[event.kind] ?? event.kind}
                    {event.reason && <span className="break-all"> · {event.reason}</span>}
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        )}
      </div>
    </details>
  );
}
