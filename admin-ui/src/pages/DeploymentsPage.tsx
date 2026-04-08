import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Rocket } from 'lucide-react';
import { toast } from 'sonner';

import { listApps } from '@/api/apps';
import { ApiError } from '@/api/client';
import type { DeploymentSummary, IssueDeploymentTokenResult } from '@/api/types';
import { createDeployment, deactivateDeployment, issueDeploymentToken, listMyDeployments, listMyEntitlements, updateDeployment } from '@/api/user';
import { DeploymentEditDialog } from '@/components/portal/DeploymentEditDialog';
import { DeploymentRecordCard } from '@/components/portal/DeploymentRecordCard';
import { DeploymentWizard, type DeployableAppOption } from '@/components/portal/DeploymentWizard';
import { EmptyState } from '@/components/portal/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { getAppDeliveryMode, getDeliveryManifest } from '@/lib/app-delivery';

type DeploymentIssueDetails = {
  code?: string;
  missingDomains?: Array<{ label?: string }>;
  missingFields?: Array<{ label?: string }>;
};

export function DeploymentsPage() {
  const qc = useQueryClient();
  const [issuedToken, setIssuedToken] = useState<IssueDeploymentTokenResult | null>(null);
  const [editingDeployment, setEditingDeployment] = useState<DeploymentSummary | null>(null);
  const appsQuery = useQuery({ queryKey: ['public-apps'], queryFn: listApps });
  const entitlementsQuery = useQuery({ queryKey: ['my-entitlements'], queryFn: listMyEntitlements });
  const deploymentsQuery = useQuery({ queryKey: ['my-deployments'], queryFn: listMyDeployments });

  const apps = appsQuery.data?.items ?? [];
  const summaries = entitlementsQuery.data?.summary ?? [];
  const summaryMap = new Map(summaries.map((entry) => [entry.appCode, entry.featureCodes]));
  const oneClickAppMap = useMemo(
    () =>
      new Map(
        apps
          .filter((app) => getAppDeliveryMode(app) === 'one_click')
          .map((app) => {
            const manifest = getDeliveryManifest(app);
            return [
              app.code,
              {
                appCode: app.code,
                appName: app.name,
                manifest,
                defaultInstallPath: manifest?.installer.installPath ?? '/opt/fd-headless-wp-system'
              }
            ];
          })
      ),
    [apps]
  );

  const deployableApps = useMemo<DeployableAppOption[]>(
    () =>
      apps
        .filter((app) => {
          if (getAppDeliveryMode(app) !== 'one_click') {
            return false;
          }
          return summaryMap.has(app.code);
        })
        .map((app) => {
          const manifest = getDeliveryManifest(app);
          return {
            appCode: app.code,
            appName: app.name,
            appType: app.type,
            featureCount: summaryMap.get(app.code)?.length ?? 0,
            manifest,
            defaultInstallPath: manifest?.installer.installPath ?? '/opt/fd-headless-wp-system',
          };
        }),
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

  const updateDeploymentMutation = useMutation({
    mutationFn: updateDeployment,
    onSuccess: (result) => {
      toast.success('部署配置已更新');
      setEditingDeployment(null);
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
      setIssuedToken((current) => (current?.deploymentId === result.id ? null : current));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '更新部署配置失败');
    }
  });

  const issueTokenMutation = useMutation({
    mutationFn: issueDeploymentToken,
    onSuccess: (result) => {
      setIssuedToken(result);
      toast.success('部署令牌已签发');
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
    },
    onError: (err, variables) => {
      const details =
        err instanceof ApiError ? (err.details as DeploymentIssueDetails | undefined) : undefined;
      if (details?.code === 'deployment_config_incomplete') {
        const target = deployments.find((deployment) => deployment.id === variables.deploymentId) ?? null;
        const missingLabels = [
          ...(details.missingDomains ?? []).map((item) => item.label).filter(Boolean),
          ...(details.missingFields ?? []).map((item) => item.label).filter(Boolean)
        ].slice(0, 3);

        setEditingDeployment(target);
        toast.error(
          missingLabels.length > 0
            ? `当前 deployment 缺少必填配置：${missingLabels.join('、')}。请先补充后再签发 token。`
            : '当前 deployment 缺少新的必填配置，请先补充后再签发 token。'
        );
        return;
      }

      toast.error(err instanceof Error ? err.message : '签发部署令牌失败');
    }
  });

  const deactivateDeploymentMutation = useMutation({
    mutationFn: deactivateDeployment,
    onSuccess: () => {
      toast.success('Deployment 已停用');
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
      setIssuedToken(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '停用 deployment 失败');
    }
  });

  const handleWizardCreate = async (payload: Parameters<typeof createDeployment>[0]): Promise<{ id: string }> => {
    return await createDeploymentMutation.mutateAsync(payload);
  };

  const handleWizardIssueToken = async (params: { deploymentId: string; expiresInHours: number }): Promise<IssueDeploymentTokenResult> => {
    return await issueTokenMutation.mutateAsync(params);
  };

  const deployments = deploymentsQuery.data?.items ?? [];
  const editingAppOption =
    editingDeployment?.app?.code ? oneClickAppMap.get(editingDeployment.app.code) ?? null : null;

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
                  deactivating={
                    deactivateDeploymentMutation.isPending &&
                    deactivateDeploymentMutation.variables?.deploymentId === deployment.id
                  }
                  onIssueToken={(deploymentId) => issueTokenMutation.mutate({ deploymentId, expiresInHours: 2 })}
                  onEdit={(target) => setEditingDeployment(target)}
                  onDeactivate={(target) => {
                    if (!window.confirm(`停用 ${target.label} 后，将释放 active deployment 名额，并使当前 token 失效。确认继续吗？`)) {
                      return;
                    }
                    deactivateDeploymentMutation.mutate({ deploymentId: target.id });
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      <DeploymentEditDialog
        open={!!editingDeployment}
        onOpenChange={(open) => {
          if (!open) {
            setEditingDeployment(null);
          }
        }}
        deployment={editingDeployment}
        appOption={editingAppOption}
        saving={updateDeploymentMutation.isPending}
        onSave={async (payload) => {
          await updateDeploymentMutation.mutateAsync(payload);
        }}
      />
    </div>
  );
}
