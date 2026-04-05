import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Rocket } from 'lucide-react';
import { toast } from 'sonner';

import { listApps } from '@/api/apps';
import type { IssueDeploymentTokenResult } from '@/api/types';
import { createDeployment, issueDeploymentToken, listMyDeployments, listMyEntitlements } from '@/api/user';
import { DeploymentRecordCard } from '@/components/portal/DeploymentRecordCard';
import { DeploymentWizard, type DeployableAppOption } from '@/components/portal/DeploymentWizard';
import { EmptyState } from '@/components/portal/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { getAppDeliveryMode } from '@/lib/app-delivery';

export function DeploymentsPage() {
  const qc = useQueryClient();
  const [issuedToken, setIssuedToken] = useState<IssueDeploymentTokenResult | null>(null);
  const appsQuery = useQuery({ queryKey: ['public-apps'], queryFn: listApps });
  const entitlementsQuery = useQuery({ queryKey: ['my-entitlements'], queryFn: listMyEntitlements });
  const deploymentsQuery = useQuery({ queryKey: ['my-deployments'], queryFn: listMyDeployments });

  const apps = appsQuery.data?.items ?? [];
  const summaries = entitlementsQuery.data?.summary ?? [];
  const summaryMap = new Map(summaries.map((entry) => [entry.appCode, entry.featureCodes]));

  const deployableApps = useMemo<DeployableAppOption[]>(
    () =>
      apps.filter((app) => {
        if (getAppDeliveryMode(app) !== 'one_click') {
          return false;
        }
        return summaryMap.has(app.code);
      }).map((app) => ({
        appCode: app.code,
        appName: app.name,
        appType: app.type,
        featureCount: summaryMap.get(app.code)?.length ?? 0
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
      toast.success('部署令牌已签发');
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '签发部署令牌失败');
    }
  });

  const handleWizardCreate = async (payload: Parameters<typeof createDeployment>[0]): Promise<{ id: string }> => {
    return await createDeploymentMutation.mutateAsync(payload);
  };

  const handleWizardIssueToken = async (params: { deploymentId: string; expiresInHours: number }): Promise<IssueDeploymentTokenResult> => {
    return await issueTokenMutation.mutateAsync(params);
  };

  const deployments = deploymentsQuery.data?.items ?? [];

  return (
    <div className="space-y-8">
      <section className="space-y-2 pt-4">
        <h1 className="text-4xl font-black tracking-tight text-slate-950">部署管理</h1>
        <p className="text-lg text-muted-foreground">管理应用部署和服务器配置</p>
      </section>

      {appsQuery.isLoading || entitlementsQuery.isLoading || deploymentsQuery.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <Rocket className="h-6 w-6 animate-pulse text-primary" />
          </CardContent>
        </Card>
      ) : deployableApps.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="暂无可部署的应用"
          description="购买已启用一键部署的应用后，即可在此创建部署记录并进行安装配置。"
        />
      ) : (
        <>
          <DeploymentWizard
            options={deployableApps}
            onCreateDeployment={handleWizardCreate}
            onIssueToken={handleWizardIssueToken}
            creating={createDeploymentMutation.isPending}
            issuing={issueTokenMutation.isPending}
          />

          {deployments.length === 0 ? (
            <EmptyState
              icon={Rocket}
              title="还没有部署记录"
              description="选择一个已购应用，创建部署记录后即可签发安装令牌并完成一键部署。"
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
