import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Rocket } from 'lucide-react';
import { toast } from 'sonner';

import { listApps } from '@/api/apps';
import type { DeliveryManifest, IssueDeploymentTokenResult } from '@/api/types';
import { createDeployment, issueDeploymentToken, listMyDeployments, listMyEntitlements } from '@/api/user';
import { DeploymentRecordCard } from '@/components/portal/DeploymentRecordCard';
import { DeploymentWizard, type DeployableAppOption } from '@/components/portal/DeploymentWizard';
import { EmptyState } from '@/components/portal/EmptyState';
import { Card, CardContent } from '@/components/ui/card';

export function DeploymentsPage() {
  const qc = useQueryClient();
  const [issuedToken, setIssuedToken] = useState<IssueDeploymentTokenResult | null>(null);
  const appsQuery = useQuery({ queryKey: ['public-apps'], queryFn: listApps });
  const entitlementsQuery = useQuery({ queryKey: ['my-entitlements'], queryFn: listMyEntitlements });
  const deploymentsQuery = useQuery({ queryKey: ['my-deployments'], queryFn: listMyDeployments });

  const apps = appsQuery.data?.items ?? [];
  const summaries = entitlementsQuery.data?.summary ?? [];
  const summaryMap = new Map(summaries.map((entry) => [entry.productCode, entry.featureCodes]));

  const deployableApps = useMemo<DeployableAppOption[]>(
    () => {
      const entries = new Map<string, DeployableAppOption>();

      for (const app of apps) {
        if (app.type !== 'service' && app.type !== 'web_app') {
          continue;
        }

        for (const product of app.products ?? []) {
          if (!summaryMap.has(product.code)) {
            continue;
          }

          const next: DeployableAppOption = {
            appCode: app.code,
            productCode: product.code,
            productName: product.name,
            featureCount: summaryMap.get(product.code)?.length ?? 0,
            profileName: app.name,
            productType: product.type || app.type,
            deliveryManifest: (app.meta?.deliveryManifest as DeliveryManifest | undefined) ?? null
          };

          const current = entries.get(product.code);
          if (!current || app.code === product.code) {
            entries.set(product.code, next);
          }
        }
      }

      return Array.from(entries.values()).sort((left, right) => left.productName.localeCompare(right.productName, 'zh-CN'));
    },
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
        <p className="text-lg text-muted-foreground">管理已购产品的交付与服务器部署</p>
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
          title="暂无可部署的产品"
          description="购买支持交付的产品后，即可在此创建部署记录并进行安装配置。"
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
              description="选择一个已购产品，创建部署记录后即可签发安装令牌并完成一键部署。"
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
