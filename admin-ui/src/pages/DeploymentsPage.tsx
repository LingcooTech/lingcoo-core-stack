import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Rocket } from 'lucide-react';
import { toast } from 'sonner';

import { listApps } from '@/api/apps';
import { createDeployment, issueDeploymentToken, listMyDeployments, listMyEntitlements } from '@/api/user';
import { DeploymentCreateCard, type DeployableAppOption } from '@/components/portal/DeploymentCreateCard';
import { DeploymentRecordCard } from '@/components/portal/DeploymentRecordCard';
import { EmptyState } from '@/components/portal/EmptyState';
import { MetricStrip } from '@/components/portal/MetricStrip';
import { PageHeader } from '@/components/portal/PageHeader';
import { Card, CardContent } from '@/components/ui/card';

export function DeploymentsPage() {
  const qc = useQueryClient();
  const [issuedToken, setIssuedToken] = useState<Awaited<ReturnType<typeof issueDeploymentToken>> | null>(null);
  const appsQuery = useQuery({ queryKey: ['public-apps'], queryFn: listApps });
  const entitlementsQuery = useQuery({ queryKey: ['my-entitlements'], queryFn: listMyEntitlements });
  const deploymentsQuery = useQuery({ queryKey: ['my-deployments'], queryFn: listMyDeployments });

  const apps = appsQuery.data?.items ?? [];
  const summaries = entitlementsQuery.data?.summary ?? [];
  const summaryMap = new Map(summaries.map((entry) => [entry.productCode, entry.featureCodes]));

  const deployableApps = useMemo<DeployableAppOption[]>(
    () =>
      apps.filter((app) => {
        if (app.type !== 'service' && app.type !== 'web_app') {
          return false;
        }
        return (app.products ?? []).some((product) => summaryMap.has(product.code));
      }).map((app) => ({
        appCode: app.code,
        appName: app.name,
        appType: app.type,
        products: (app.products ?? [])
          .filter((product) => summaryMap.has(product.code))
          .map((product) => ({
            code: product.code,
            name: product.name,
            featureCount: summaryMap.get(product.code)?.length ?? 0
          }))
      })),
    [apps, summaries]
  );

  const createDeploymentMutation = useMutation({
    mutationFn: createDeployment,
    onSuccess: () => {
      toast.success('部署记录已创建');
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '创建部署记录失败');
    }
  });

  const issueTokenMutation = useMutation({
    mutationFn: issueDeploymentToken,
    onSuccess: (result) => {
      setIssuedToken(result);
      toast.success('一次性 deploy token 已签发');
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '签发 deploy token 失败');
    }
  });

  const deployments = deploymentsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader sectionKey="deploy" />

      <MetricStrip
        items={[
          { label: 'Deployable Apps', value: deployableApps.length, note: '当前已具备部署资格的系统类应用数量。' },
          { label: 'Deployments', value: deployments.length, note: '已经建立的部署记录数量。' },
          { label: 'Service Apps', value: apps.filter((app) => app.type === 'service').length, note: '适合承接 Headless WP 这类系统产品。' },
          {
            label: 'Delivery Source',
            value: 'Entitlements',
            note: '部署入口会建立在购买后的授权结果之上，而不是单独一套临时码。'
          },
          {
            label: 'Current Stage',
            value: 'Installer Bootstrap',
            note: '现在已经可以签发 deploy token，并生成供远程安装器直接使用的一键命令。'
          }
        ]}
      />

      {appsQuery.isLoading || entitlementsQuery.isLoading || deploymentsQuery.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <Rocket className="h-6 w-6 animate-pulse text-primary" />
          </CardContent>
        </Card>
      ) : deployableApps.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="当前还没有可部署的系统产品"
          description="当 Headless WP 这类系统产品在后台被定义为 service / web_app，并且当前账号持有对应授权后，这里就会出现部署入口。"
        />
      ) : (
        <>
          <DeploymentCreateCard
            options={deployableApps}
            pending={createDeploymentMutation.isPending}
            onSubmit={(payload) => createDeploymentMutation.mutate(payload)}
          />

          {deployments.length === 0 ? (
            <EmptyState
              icon={Rocket}
              title="还没有创建部署记录"
              description="先为你的 Headless WP 系统创建部署记录，再签发一次性 deploy token。系统会返回可直接调用远程安装器的一键命令。"
            />
          ) : (
            <div className="grid gap-4">
              {deployments.map((deployment) => (
                <DeploymentRecordCard
                  key={deployment.id}
                  deployment={deployment}
                  issuedToken={issuedToken}
                  issuing={issueTokenMutation.isPending && issueTokenMutation.variables?.deploymentId === deployment.id}
                  onIssueToken={(deploymentId) => issueTokenMutation.mutate({ deploymentId, expiresInHours: 2 })}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
