import type { DeploymentSummary, IssueDeploymentTokenResult } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatTime } from '@/lib/utils';

function summarizeImageRef(value: string | null) {
  if (!value) {
    return '未配置';
  }

  const segments = value.split('/');
  return segments[segments.length - 1] || value;
}

function getActionLabel(
  kind:
    | 'apply_runtime_images'
    | 'apply_wordpress_assets'
    | 'ignore_runtime_images'
    | 'ignore_wordpress_assets'
) {
  switch (kind) {
    case 'apply_runtime_images':
      return '应用前端更新';
    case 'apply_wordpress_assets':
      return '应用 WP 资产更新';
    case 'ignore_runtime_images':
      return '忽略前端更新';
    case 'ignore_wordpress_assets':
      return '忽略 WP 资产更新';
    default:
      return '未知动作';
  }
}

function getRuntimeDiffRows(deployment: DeploymentSummary) {
  const rows = [];

  if (
    deployment.currentRuntimeImages.frontendImage !== deployment.availableRuntimeImages.frontendImage &&
    deployment.availableRuntimeImages.frontendImage
  ) {
    rows.push({
      label: 'Frontend',
      current: summarizeImageRef(deployment.currentRuntimeImages.frontendImage),
      next: summarizeImageRef(deployment.availableRuntimeImages.frontendImage)
    });
  }

  if (
    deployment.currentRuntimeImages.websocketImage !== deployment.availableRuntimeImages.websocketImage &&
    deployment.availableRuntimeImages.websocketImage
  ) {
    rows.push({
      label: 'WebSocket',
      current: summarizeImageRef(deployment.currentRuntimeImages.websocketImage),
      next: summarizeImageRef(deployment.availableRuntimeImages.websocketImage)
    });
  }

  return rows;
}

function getWordpressDiffRows(deployment: DeploymentSummary) {
  const pairs: Array<[string, string, string]> = [
    ['主题', 'FD_THEME_RELEASE_TAG', 'AVAILABLE_FD_THEME_RELEASE_TAG'],
    ['Composer', 'FD_PAGE_COMPOSER_RELEASE_TAG', 'AVAILABLE_FD_PAGE_COMPOSER_RELEASE_TAG'],
    ['Admin UI', 'FD_ADMIN_UI_RELEASE_TAG', 'AVAILABLE_FD_ADMIN_UI_RELEASE_TAG'],
    ['Member', 'FD_MEMBER_RELEASE_TAG', 'AVAILABLE_FD_MEMBER_RELEASE_TAG'],
    ['Payment', 'FD_PAYMENT_RELEASE_TAG', 'AVAILABLE_FD_PAYMENT_RELEASE_TAG'],
    ['Commerce', 'FD_COMMERCE_RELEASE_TAG', 'AVAILABLE_FD_COMMERCE_RELEASE_TAG'],
    ['Content Types', 'FD_CONTENT_TYPES_RELEASE_TAG', 'AVAILABLE_FD_CONTENT_TYPES_RELEASE_TAG'],
    ['Forms', 'FD_FORMS_RELEASE_TAG', 'AVAILABLE_FD_FORMS_RELEASE_TAG'],
    ['AI Router', 'FD_AI_ROUTER_RELEASE_TAG', 'AVAILABLE_FD_AI_ROUTER_RELEASE_TAG'],
    ['WS Push', 'FD_WEBSOCKET_PUSH_RELEASE_TAG', 'AVAILABLE_FD_WEBSOCKET_PUSH_RELEASE_TAG'],
    ['WPGraphQL', 'WPGRAPHQL_RELEASE_TAG', 'AVAILABLE_WPGRAPHQL_RELEASE_TAG'],
    ['JWT Auth', 'WPGRAPHQL_JWT_AUTH_RELEASE_TAG', 'AVAILABLE_WPGRAPHQL_JWT_AUTH_RELEASE_TAG'],
    ['Tax Query', 'WPGRAPHQL_TAX_QUERY_REF', 'AVAILABLE_WPGRAPHQL_TAX_QUERY_REF']
  ];

  return pairs
    .map(([label, currentKey, availableKey]) => ({
      label,
      current: deployment.currentWordpressAssetReleases[currentKey] ?? null,
      next: deployment.availableWordpressAssetReleases[availableKey] ?? null
    }))
    .filter((item) => item.next && item.current !== item.next);
}

function getDomainScopeLabel(scope: 'registrable_domain' | 'exact_host') {
  return scope === 'exact_host' ? '完整子域名' : '根域名';
}

export function DeploymentRecordCard({
  deployment,
  issuedToken,
  issuing,
  deactivating,
  applyingRuntimeUpdate,
  applyingWordpressUpdate,
  ignoringRuntimeUpdate,
  ignoringWordpressUpdate,
  onIssueToken,
  onEdit,
  onDeactivate,
  onApplyRuntimeUpdate,
  onApplyWordpressUpdate,
  onIgnoreRuntimeUpdate,
  onIgnoreWordpressUpdate
}: {
  deployment: DeploymentSummary;
  issuedToken?: IssueDeploymentTokenResult | null;
  issuing?: boolean;
  deactivating?: boolean;
  applyingRuntimeUpdate?: boolean;
  applyingWordpressUpdate?: boolean;
  ignoringRuntimeUpdate?: boolean;
  ignoringWordpressUpdate?: boolean;
  onIssueToken: (deploymentId: string) => void;
  onEdit: (deployment: DeploymentSummary) => void;
  onDeactivate: (deployment: DeploymentSummary) => void;
  onApplyRuntimeUpdate: (deployment: DeploymentSummary) => void;
  onApplyWordpressUpdate: (deployment: DeploymentSummary) => void;
  onIgnoreRuntimeUpdate: (deployment: DeploymentSummary) => void;
  onIgnoreWordpressUpdate: (deployment: DeploymentSummary) => void;
}) {
  const hasAvailableRuntimeUpdate =
    Boolean(deployment.availableRuntimeImages.frontendImage) ||
    Boolean(deployment.availableRuntimeImages.websocketImage);
  const hasAvailableWordpressUpdate = Object.values(deployment.availableWordpressAssetReleases).some(Boolean);
  const runtimeDiffRows = getRuntimeDiffRows(deployment);
  const wordpressDiffRows = getWordpressDiffRows(deployment);
  const domainBindingLabel =
    deployment.domainBinding.sourceLabel ??
    (deployment.domainBinding.sourceField !== 'none' ? deployment.domainBinding.sourceField : '域名');
  const domainEntries = Object.entries(deployment.domainValues).filter(([, value]) => value.trim().length > 0);
  const boundDomain =
    deployment.domainBinding.boundDomain ??
    (deployment.domainBinding.sourceField !== 'none'
      ? deployment.domainValues[deployment.domainBinding.sourceField] ?? null
      : null);

  return (
    <Card className="rounded-lg border-gray-200/80 bg-white/95 shadow-sm shadow-gray-900/5">
      <CardHeader className="space-y-2.5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg tracking-tight">{deployment.label}</CardTitle>
            <CardDescription>
              {deployment.app?.name ?? deployment.app?.code ?? 'Unknown App'}
            </CardDescription>
          </div>
          <Badge variant={deployment.status === 'active' ? 'default' : 'secondary'}>{deployment.status}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{deployment.environment}</Badge>
          {deployment.serverHost ? <Badge variant="secondary">{deployment.serverHost}</Badge> : null}
          {domainEntries.slice(0, 3).map(([key, value]) => (
            <Badge key={key} variant="outline">{value}</Badge>
          ))}
          <Badge variant={deployment.updatePolicy === 'auto' ? 'default' : 'secondary'}>
            {deployment.updatePolicy === 'auto' ? '自动更新' : '手动更新'}
          </Badge>
          {deployment.domainBinding.isLocked ? (
            <Badge variant="secondary">已绑定域名</Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-3.5">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => onEdit(deployment)}>
            编辑配置
          </Button>
          {hasAvailableRuntimeUpdate ? (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => onApplyRuntimeUpdate(deployment)}
              disabled={applyingRuntimeUpdate || Boolean(deployment.pendingAction)}
            >
              {applyingRuntimeUpdate ? '提交中...' : '应用前端更新'}
            </Button>
          ) : null}
          {hasAvailableRuntimeUpdate ? (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-lg"
              onClick={() => onIgnoreRuntimeUpdate(deployment)}
              disabled={ignoringRuntimeUpdate || Boolean(deployment.pendingAction)}
            >
              {ignoringRuntimeUpdate ? '提交中...' : '忽略前端更新'}
            </Button>
          ) : null}
          {hasAvailableWordpressUpdate ? (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => onApplyWordpressUpdate(deployment)}
              disabled={applyingWordpressUpdate || Boolean(deployment.pendingAction)}
            >
              {applyingWordpressUpdate ? '提交中...' : '应用 WP 资产更新'}
            </Button>
          ) : null}
          {hasAvailableWordpressUpdate ? (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-lg"
              onClick={() => onIgnoreWordpressUpdate(deployment)}
              disabled={ignoringWordpressUpdate || Boolean(deployment.pendingAction)}
            >
              {ignoringWordpressUpdate ? '提交中...' : '忽略 WP 资产更新'}
            </Button>
          ) : null}
          {deployment.status === 'active' ? (
            <Button variant="destructive" size="sm" className="rounded-lg" onClick={() => onDeactivate(deployment)} disabled={deactivating}>
              {deactivating ? '停用中...' : '停用 Deployment'}
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <InfoLine
            label="部署授权"
            value={
              deployment.entitlement?.plan
                ? `${deployment.entitlement.plan.name} · ${deployment.entitlement.status}`
                : '未绑定授权'
            }
          />
          {domainEntries.length > 0 ? (
            domainEntries.map(([key, value]) => (
              <InfoLine
                key={key}
                label={key === deployment.domainBinding.sourceField ? domainBindingLabel : `域名 · ${key}`}
                value={value}
                mono
              />
            ))
          ) : (
            <InfoLine label="域名配置" value="未设置" />
          )}
          <InfoLine
            label="域名绑定"
            value={
              deployment.domainBinding.isLocked
                ? `${domainBindingLabel}: ${boundDomain ?? '已绑定'}（${getDomainScopeLabel(deployment.domainBinding.scope)}）`
                : deployment.domainBinding.sourceField !== 'none'
                  ? `启用，首次成功部署后锁定${domainBindingLabel}（${getDomainScopeLabel(deployment.domainBinding.scope)}）`
                  : '未启用'
            }
          />
          <InfoLine label="镜像更新策略" value={deployment.updatePolicy === 'auto' ? '自动应用新镜像' : '仅记录可用镜像'} />
          <InfoLine label="当前前端镜像" value={summarizeImageRef(deployment.currentRuntimeImages.frontendImage)} mono />
          <InfoLine label="当前 WS 镜像" value={summarizeImageRef(deployment.currentRuntimeImages.websocketImage)} mono />
          <InfoLine label="安装路径" value={deployment.installPath} mono />
          <InfoLine label="创建时间" value={formatTime(deployment.createdAt)} />
        </div>

        {runtimeDiffRows.length > 0 ? (
          <DiffSection
            title="前端更新差异"
            rows={runtimeDiffRows}
            offeredAt={deployment.availableRuntimeImages.offeredAt}
          />
        ) : null}

        {wordpressDiffRows.length > 0 ? (
          <DiffSection
            title="WP 资产更新差异"
            rows={wordpressDiffRows}
            offeredAt={Object.values(deployment.availableWordpressAssetReleases).some(Boolean) ? null : null}
          />
        ) : null}

        <div className="rounded-lg border border-gray-200 bg-gray-50/85 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold tracking-tight text-slate-900">Deploy Token</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {deployment.latestToken
                  ? `最近一次 token 尾号 ${deployment.latestToken.tokenHint}，状态 ${deployment.latestToken.status}`
                  : '还没有签发 deploy token'}
              </p>
            </div>
            <Button
              variant="outline"
              className="rounded-lg"
              onClick={() => onIssueToken(deployment.id)}
              disabled={issuing || deployment.status !== 'active'}
            >
              {issuing ? '签发中...' : '签发新 Token'}
            </Button>
          </div>
          {deployment.status !== 'active' ? (
            <p className="mt-3 text-xs text-amber-700">当前 deployment 已停用。需要重新使用时，请编辑后新建 deployment，或保留此记录仅作历史参考。</p>
          ) : null}
          {deployment.pendingAction ? (
            <p className="mt-3 text-xs text-blue-700">
              待执行动作：{getActionLabel(deployment.pendingAction.kind)}
              {deployment.pendingAction.requestedAt ? ` · ${formatTime(deployment.pendingAction.requestedAt)}` : ''}
            </p>
          ) : null}
          {deployment.lastAction ? (
            <p className="mt-3 text-xs text-muted-foreground">
              最近动作：{getActionLabel(deployment.lastAction.kind)} ·
              {deployment.lastAction.status === 'completed' ? ' 已完成' : ' 失败'}
              {deployment.lastAction.finishedAt ? ` · ${formatTime(deployment.lastAction.finishedAt)}` : ''}
              {deployment.lastAction.message ? ` · ${deployment.lastAction.message}` : ''}
            </p>
          ) : null}
          {deployment.domainBinding.isLocked ? (
            <p className="mt-3 text-xs text-muted-foreground">
              当前{domainBindingLabel}已绑定为 {boundDomain ?? '已绑定'}。如需更换，需要提交工单处理。
            </p>
          ) : null}

          {issuedToken?.deploymentId === deployment.id ? (
            <div className="mt-4 space-y-3">
              <InfoLine label="本次 Token 尾号" value={issuedToken.tokenHint} mono />
              <InfoLine label="过期时间" value={formatTime(issuedToken.expiresAt)} />
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Remote Install</p>
                <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                  {issuedToken.remoteInstallCommand ?? '当前未生成远程安装命令'}
                </pre>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Exchange URL</p>
                <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{issuedToken.exchangeUrl}</pre>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">One-time Token</p>
                <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{issuedToken.token}</pre>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Exchange Curl</p>
                <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{issuedToken.exchangeCurl}</pre>
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoLine({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-sm text-slate-900 ${mono ? 'font-mono' : 'font-medium'}`}>{value}</p>
    </div>
  );
}

function DiffSection({
  title,
  rows,
  offeredAt
}: {
  title: string;
  rows: Array<{ label: string; current: string | null; next: string | null }>;
  offeredAt?: string | null;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold tracking-tight text-slate-900">{title}</p>
        {offeredAt ? <span className="text-xs text-muted-foreground">{formatTime(offeredAt)}</span> : null}
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[110px,1fr,20px,1fr] items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{row.label}</span>
            <span className="min-w-0 break-all font-mono text-xs text-slate-700">{row.current ?? '-'}</span>
            <span className={cn('text-center text-xs text-gray-400')}>→</span>
            <span className="min-w-0 break-all font-mono text-xs text-slate-900">{row.next ?? '-'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
