import type { DeploymentSummary, IssueDeploymentTokenResult } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTime } from '@/lib/utils';

export function DeploymentRecordCard({
  deployment,
  issuedToken,
  issuing,
  deactivating,
  onIssueToken,
  onEdit,
  onDeactivate
}: {
  deployment: DeploymentSummary;
  issuedToken?: IssueDeploymentTokenResult | null;
  issuing?: boolean;
  deactivating?: boolean;
  onIssueToken: (deploymentId: string) => void;
  onEdit: (deployment: DeploymentSummary) => void;
  onDeactivate: (deployment: DeploymentSummary) => void;
}) {
  return (
    <Card className="border-slate-200/80 bg-white/95">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{deployment.label}</CardTitle>
            <CardDescription>
              {deployment.app?.name ?? deployment.app?.code ?? 'Unknown App'}
            </CardDescription>
          </div>
          <Badge variant={deployment.status === 'active' ? 'default' : 'secondary'}>{deployment.status}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{deployment.environment}</Badge>
          {deployment.serverHost ? <Badge variant="secondary">{deployment.serverHost}</Badge> : null}
          {deployment.primaryDomain ? <Badge variant="outline">{deployment.primaryDomain}</Badge> : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(deployment)}>
            编辑配置
          </Button>
          {deployment.status === 'active' ? (
            <Button variant="destructive" size="sm" onClick={() => onDeactivate(deployment)} disabled={deactivating}>
              {deactivating ? '停用中...' : '停用 Deployment'}
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <InfoLine label="后台域名" value={deployment.adminDomain || '未设置'} />
          <InfoLine label="WS 域名" value={deployment.wsDomain || '未设置'} />
          <InfoLine label="安装路径" value={deployment.installPath} mono />
          <InfoLine label="创建时间" value={formatTime(deployment.createdAt)} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black text-slate-900">Deploy Token</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {deployment.latestToken
                  ? `最近一次 token 尾号 ${deployment.latestToken.tokenHint}，状态 ${deployment.latestToken.status}`
                  : '还没有签发 deploy token'}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => onIssueToken(deployment.id)}
              disabled={issuing || deployment.status !== 'active'}
            >
              {issuing ? '签发中...' : '签发新 Token'}
            </Button>
          </div>
          {deployment.status !== 'active' ? (
            <p className="mt-3 text-xs text-amber-700">当前 deployment 已停用。需要重新使用时，请编辑后新建 deployment，或保留此记录仅作历史参考。</p>
          ) : null}

          {issuedToken?.deploymentId === deployment.id ? (
            <div className="mt-4 space-y-3">
              <InfoLine label="本次 Token 尾号" value={issuedToken.tokenHint} mono />
              <InfoLine label="过期时间" value={formatTime(issuedToken.expiresAt)} />
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Remote Install</p>
                <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
                  {issuedToken.remoteInstallCommand ?? '当前未生成远程安装命令'}
                </pre>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Exchange URL</p>
                <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{issuedToken.exchangeUrl}</pre>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">One-time Token</p>
                <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{issuedToken.token}</pre>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Exchange Curl</p>
                <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{issuedToken.exchangeCurl}</pre>
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
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-1 text-sm text-slate-900 ${mono ? 'font-mono' : 'font-medium'}`}>{value}</p>
    </div>
  );
}
