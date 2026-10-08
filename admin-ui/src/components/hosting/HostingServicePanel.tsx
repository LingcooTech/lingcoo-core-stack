import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  hostingServiceCommandSchema,
  type HostingService,
  type HostingServiceCommand,
} from '@lingcoo/contracts';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/shared/StatusPill';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';
import { formatTime } from '@/lib/utils';

const states = {
  pending_delivery: '等待交付起算',
  active: '服务期内',
  grace: '宽限期内',
  expired: '服务期已到期',
};
const sourceLabels = { trial: '试用服务', manual: '人工授予', paid: '已支付托管' };
export function HostingServicePanel({
  deploymentId,
  admin = false,
}: {
  deploymentId: string;
  admin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="rounded-lg border bg-card p-4"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-medium">托管服务期限</summary>
      {open && <ServiceContent key={deploymentId} deploymentId={deploymentId} admin={admin} />}
    </details>
  );
}
function ServiceContent({ deploymentId, admin }: { deploymentId: string; admin: boolean }) {
  const { user } = useAuth();
  const canManage = admin && hasPermission(normalizeRole(user?.role), 'hosting.terms.manage');
  const query = useQuery({
    queryKey: ['hosting-service', admin, deploymentId],
    queryFn: async () =>
      admin
        ? apiClient(
            'GET /v1/admin/deployments/:deploymentId/hosting-service',
            `/v1/admin/deployments/${deploymentId}/hosting-service`,
          )
        : {
            ...(await apiClient(
              'GET /v1/deployments/:deploymentId/hosting-service',
              `/v1/deployments/${deploymentId}/hosting-service`,
            )),
            changes: [],
          },
    refetchInterval: 60_000,
  });
  if (query.isPending)
    return <p className="mt-4 text-sm text-muted-foreground">正在读取服务期限…</p>;
  if (query.isError)
    return (
      <div role="alert" className="mt-4 text-sm text-destructive">
        {query.error.message}
        <Button variant="ghost" onClick={() => void query.refetch()}>
          重试
        </Button>
      </div>
    );
  const service = query.data.service;
  const changes = query.data.changes;
  return (
    <div className="mt-4 space-y-4 text-sm">
      {service ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              tone={
                service.state === 'expired'
                  ? 'danger'
                  : service.state === 'grace'
                    ? 'warn'
                    : service.state === 'active'
                      ? 'ok'
                      : 'neutral'
              }
              label={states[service.state]}
            />
            <span className="text-muted-foreground">
              {sourceLabels[service.source]} · {service.interval === 'month' ? '月周期' : '年周期'}
            </span>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              ['本轮服务起算', service.anchorAt ? formatTime(service.anchorAt) : '成功交付后起算'],
              ['服务到期', service.expiresAt ? formatTime(service.expiresAt) : '尚未开始计时'],
              ['宽限期', `${service.graceDays} 天`],
              ['停服后数据保留', `${service.retentionDays} 天`],
              ...(service.graceEndsAt ? [['宽限期结束', formatTime(service.graceEndsAt)]] : []),
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            服务期限与软件授权分别管理。到期状态不代表应用已经停止运行；本页登记不产生付款记录。
          </p>
        </>
      ) : (
        <p className="text-muted-foreground">尚未登记托管服务期限，请联系平台确认服务安排。</p>
      )}
      {canManage && (
        <ServiceForm key={service?.version ?? 0} deploymentId={deploymentId} service={service} />
      )}
      {admin && changes.length > 0 && (
        <details className="border-t pt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            最近 {changes.length} 条变更记录
          </summary>
          <ol className="mt-3 space-y-3">
            {changes.map((c) => (
              <li key={c.id} className="rounded-md bg-muted/40 p-3 text-xs">
                <p className="font-medium">
                  {c.kind === 'register' ? '登记' : c.kind === 'extend' ? '人工延长' : '交付起算'} ·
                  版本 {c.version} · {formatTime(c.createdAt)}
                </p>
                <p className="mt-1 break-words">{c.reason}</p>
                <p className="mt-1 text-muted-foreground">
                  到期时间：{c.before?.expiresAt ? formatTime(c.before.expiresAt) : '未起算'} →{' '}
                  {c.after.expiresAt ? formatTime(c.after.expiresAt) : '等待交付'}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
function ServiceForm({
  deploymentId,
  service,
}: {
  deploymentId: string;
  service: HostingService | null;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const pendingKey = useRef<{ body: string; key: string } | null>(null);
  const mutation = useMutation({
    mutationFn: (body: HostingServiceCommand) =>
      apiClient(
        'POST /v1/admin/deployments/:deploymentId/hosting-service',
        `/v1/admin/deployments/${deploymentId}/hosting-service`,
        { body: JSON.stringify(body) },
      ),
    onSuccess: (result) => {
      qc.setQueryData(['hosting-service', true, deploymentId], result);
      void qc.invalidateQueries({ queryKey: ['hosting-service', false, deploymentId] });
      setEditing(false);
    },
    onError: (e) => setError(e.message),
  });
  if (!editing)
    return (
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        {service ? '人工延长服务期' : '登记托管服务期'}
      </Button>
    );
  return (
    <form
      className="space-y-3 rounded-lg border bg-muted/20 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        const values = new FormData(e.currentTarget);
        const body = {
          kind: service ? 'extend' : 'register',
          expectedVersion: service?.version ?? 0,
          periods: Number(values.get('periods')),
          reason: String(values.get('reason') ?? ''),
          ...(!service
            ? {
                source: values.get('source'),
                interval: values.get('interval'),
                graceDays: Number(values.get('graceDays')),
                retentionDays: Number(values.get('retentionDays')),
              }
            : {}),
        };
        const serialized = JSON.stringify(body);
        if (pendingKey.current?.body !== serialized)
          pendingKey.current = { body: serialized, key: crypto.randomUUID() };
        const parsed = hostingServiceCommandSchema.safeParse({
          ...body,
          requestKey: pendingKey.current.key,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? '请检查输入');
          return;
        }
        mutation.mutate(parsed.data);
      }}
    >
      <p className="text-xs text-muted-foreground">
        仅登记试用或人工授予的期限，不代表收款。已交付实例从登记时起算；未交付实例等待公网验证成功。到期后的延期从本次交付就绪时重新起算。
      </p>
      <fieldset disabled={mutation.isPending} className="grid gap-3 sm:grid-cols-2">
        {!service && (
          <>
            <label className="space-y-1 text-xs">
              服务来源
              <select name="source" className="h-10 w-full rounded-lg border bg-card px-3 text-sm">
                <option value="trial">试用</option>
                <option value="manual">人工授予</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">
              周期
              <select
                name="interval"
                className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
              >
                <option value="month">月</option>
                <option value="year">年</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">
              宽限天数
              <Input name="graceDays" type="number" required min={0} max={90} />
            </label>
            <label className="space-y-1 text-xs">
              停服后保留天数
              <Input name="retentionDays" type="number" required min={1} max={3650} />
            </label>
          </>
        )}
        <label className="space-y-1 text-xs">
          {service ? '增加周期数' : '服务周期数'}
          <Input name="periods" type="number" min={1} max={120} defaultValue={1} required />
        </label>
        <label className="space-y-1 text-xs sm:col-span-2">
          变更原因（仅后台可见）
          <textarea
            name="reason"
            required
            minLength={5}
            maxLength={500}
            rows={3}
            className="w-full rounded-lg border bg-card p-3 text-sm"
          />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}{' '}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              void qc.invalidateQueries({ queryKey: ['hosting-service', true, deploymentId] })
            }
          >
            刷新记录
          </Button>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? '保存中…' : service ? '确认延长服务期' : '确认登记服务期'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => setEditing(false)}
        >
          取消
        </Button>
      </div>
    </form>
  );
}
