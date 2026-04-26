import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Boxes, LoaderCircle, Rocket } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { listApps } from '@/api/apps';
import { ApiError } from '@/api/client';
import type { DeploymentSummary, IssueDeploymentTokenResult } from '@/api/types';
import { createDeployment, deactivateDeployment, issueDeploymentToken, listMyDeployments, listMyEntitlements, requestDeploymentAction, updateDeployment } from '@/api/user';
import { DeploymentEditDialog } from '@/components/portal/DeploymentEditDialog';
import { DeploymentRecordCard } from '@/components/portal/DeploymentRecordCard';
import { DeploymentWizard, type DeployableAppOption } from '@/components/portal/DeploymentWizard';
import { EmptyState } from '@/components/portal/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getAppDeliveryMode, getDeliveryManifest } from '@/lib/app-delivery';

type DeploymentIssueDetails = {
  code?: string;
  missingDomains?: Array<{ label?: string }>;
  missingFields?: Array<{ label?: string }>;
};

export function DeploymentsPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
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

  const requestRuntimeUpdateMutation = useMutation({
    mutationFn: (deploymentId: string) =>
      requestDeploymentAction({ deploymentId, kind: 'apply_runtime_images' }),
    onSuccess: () => {
      toast.success('前端更新动作已提交，等待服务器拉取执行');
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '提交前端更新动作失败');
    }
  });

  const requestWordpressUpdateMutation = useMutation({
    mutationFn: (deploymentId: string) =>
      requestDeploymentAction({ deploymentId, kind: 'apply_wordpress_assets' }),
    onSuccess: () => {
      toast.success('WP 资产更新动作已提交，等待服务器拉取执行');
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '提交 WP 资产更新动作失败');
    }
  });

  const ignoreRuntimeUpdateMutation = useMutation({
    mutationFn: (deploymentId: string) =>
      requestDeploymentAction({ deploymentId, kind: 'ignore_runtime_images' }),
    onSuccess: () => {
      toast.success('前端更新忽略动作已提交，等待服务器拉取执行');
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '提交忽略前端更新动作失败');
    }
  });

  const ignoreWordpressUpdateMutation = useMutation({
    mutationFn: (deploymentId: string) =>
      requestDeploymentAction({ deploymentId, kind: 'ignore_wordpress_assets' }),
    onSuccess: () => {
      toast.success('WP 资产更新忽略动作已提交，等待服务器拉取执行');
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '提交忽略 WP 资产更新动作失败');
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
  const activeDeployments = deployments.filter((deployment) => deployment.status === 'active');
  const tokenReadyDeployments = deployments.filter((deployment) => Boolean(deployment.latestToken));
  const requestedAppCode = searchParams.get('app')?.trim() || '';
  const initialDeployAppCode = deployableApps.some((option) => option.appCode === requestedAppCode)
    ? requestedAppCode
    : undefined;
  const initialDeployApp = initialDeployAppCode
    ? deployableApps.find((option) => option.appCode === initialDeployAppCode) ?? null
    : null;
  const requestedApp = requestedAppCode ? apps.find((app) => app.code === requestedAppCode) ?? null : null;
  const requestedAppUnavailable =
    Boolean(requestedAppCode) &&
    !initialDeployAppCode &&
    Boolean(requestedApp && getAppDeliveryMode(requestedApp) === 'one_click');

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">部署管理</h1>
          {initialDeployApp ? <Badge variant="secondary">{initialDeployApp.appName}</Badge> : null}
        </div>
        <p className="text-sm text-gray-500">
          {initialDeployApp
            ? `正在为 ${initialDeployApp.appName} 创建部署记录。`
            : '选择支持一键部署的应用并完成部署配置。'}
        </p>
        {requestedAppUnavailable ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {requestedApp?.name ?? requestedAppCode} 当前没有可用部署授权。可能是授权已过期、被撤销，或订单尚未同步。
            </span>
          </div>
        ) : null}
      </div>

      {appsQuery.isLoading || entitlementsQuery.isLoading || deploymentsQuery.isLoading ? (
        <Card className="rounded-xl border-gray-200 bg-white">
          <CardContent className="flex items-center justify-center gap-3 p-10 text-gray-500">
            <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
            正在加载部署数据...
          </CardContent>
        </Card>
      ) : deployableApps.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="暂无可部署的应用"
          description="购买支持一键部署的应用后，即可在这里开始部署。"
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: '可部署应用', value: String(deployableApps.length) },
              { label: '激活部署', value: String(activeDeployments.length) },
              { label: '已签发 Token', value: String(tokenReadyDeployments.length) }
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm">
                <p className="text-sm font-medium text-gray-500">{item.label}</p>
                <p className="mt-1.5 text-[1.75rem] font-semibold tracking-tight text-gray-900">{item.value}</p>
              </div>
            ))}
          </div>

          <section className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight text-gray-900">开始部署</h2>
              {!initialDeployApp ? (
                <p className="text-sm text-gray-500">未预选应用时，可在向导第一步选择应用。</p>
              ) : null}
            </div>
            <DeploymentWizard
              options={deployableApps}
              initialAppCode={initialDeployAppCode}
              onCreateDeployment={handleWizardCreate}
              onIssueToken={handleWizardIssueToken}
              creating={createDeploymentMutation.isPending}
              issuing={issueTokenMutation.isPending}
            />
          </section>

          {deployments.length === 0 ? (
            <EmptyState
              icon={Rocket}
              title="还没有部署记录"
              description="创建部署记录后即可签发安装令牌并完成一键部署。"
            />
          ) : (
            <section className="space-y-5">
              <h2 className="text-2xl font-semibold tracking-tight text-gray-900">部署记录</h2>
              <div className="grid gap-4">
                {deployments.map((deployment) => (
                  <DeploymentRecordCard
                    key={deployment.id}
                    deployment={deployment}
                    issuedToken={issuedToken}
                    issuing={issueTokenMutation.isPending && issueTokenMutation.variables?.deploymentId === deployment.id}
                    applyingRuntimeUpdate={
                      requestRuntimeUpdateMutation.isPending &&
                      requestRuntimeUpdateMutation.variables === deployment.id
                    }
                    applyingWordpressUpdate={
                      requestWordpressUpdateMutation.isPending &&
                      requestWordpressUpdateMutation.variables === deployment.id
                    }
                    ignoringRuntimeUpdate={
                      ignoreRuntimeUpdateMutation.isPending &&
                      ignoreRuntimeUpdateMutation.variables === deployment.id
                    }
                    ignoringWordpressUpdate={
                      ignoreWordpressUpdateMutation.isPending &&
                      ignoreWordpressUpdateMutation.variables === deployment.id
                    }
                    deactivating={
                      deactivateDeploymentMutation.isPending &&
                      deactivateDeploymentMutation.variables?.deploymentId === deployment.id
                    }
                    onIssueToken={(deploymentId) => issueTokenMutation.mutate({ deploymentId, expiresInHours: 2 })}
                    onEdit={(target) => setEditingDeployment(target)}
                    onApplyRuntimeUpdate={(target) => {
                      requestRuntimeUpdateMutation.mutate(target.id);
                    }}
                    onApplyWordpressUpdate={(target) => {
                      requestWordpressUpdateMutation.mutate(target.id);
                    }}
                    onIgnoreRuntimeUpdate={(target) => {
                      ignoreRuntimeUpdateMutation.mutate(target.id);
                    }}
                    onIgnoreWordpressUpdate={(target) => {
                      ignoreWordpressUpdateMutation.mutate(target.id);
                    }}
                    onDeactivate={(target) => {
                      if (!window.confirm(`停用 ${target.label} 后，将释放 active deployment 名额，并使当前 token 失效。确认继续吗？`)) {
                        return;
                      }
                      deactivateDeploymentMutation.mutate({ deploymentId: target.id });
                    }}
                  />
                ))}
              </div>
            </section>
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
