import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, LoaderCircle, Rocket, ServerCog, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { listApps } from '@/api/apps';
import { ApiError } from '@/api/client';
import type { DeploymentSummary, IssueDeploymentTokenResult } from '@/api/types';
import { createDeployment, deactivateDeployment, issueDeploymentToken, listMyDeployments, listMyEntitlements, updateDeployment } from '@/api/user';
import { DeploymentEditDialog } from '@/components/portal/DeploymentEditDialog';
import { DeploymentRecordCard } from '@/components/portal/DeploymentRecordCard';
import { DeployableAppCard } from '@/components/portal/DeployableAppCard';
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

  return (
    <div className="space-y-10">
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr),360px]">
        <div className="rounded-lg border border-gray-200/80 bg-white/92 p-8 shadow-sm shadow-gray-900/5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Deployments</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">部署管理</h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-gray-600">
            购买后的真正产品体验不应该在订单页终止。部署页需要把“哪些应用可以继续交付、当前有哪些 deployment、哪一个 token 最近签发”
            这些信息讲清楚，并把创建 deployment 的动作做成产品级入口。
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              {
                label: '可部署应用',
                value: String(deployableApps.length),
                note: '已购且支持 one-click delivery 的应用'
              },
              {
                label: '激活部署',
                value: String(activeDeployments.length),
                note: '当前仍在运行中的 deployment 记录'
              },
              {
                label: '已签发 Token',
                value: String(tokenReadyDeployments.length),
                note: '最近至少签发过一次安装令牌'
              }
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-gray-200 bg-gray-50/80 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">{item.value}</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">{item.note}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          {[
            {
              icon: Rocket,
              title: '持续交付',
              desc: '部署页要让用户感受到购买之后仍有明确的安装与交付流程，而不是孤立的技术表单。'
            },
            {
              icon: ShieldCheck,
              title: '授权承接部署',
              desc: '只有当前账户下已解锁的一键部署应用，才会继续进入这里的 deployment 流程。'
            },
            {
              icon: ServerCog,
              title: '服务器配置显式化',
              desc: 'deployment 不是一堆字段，而是一个面向安装路径、域名、token 和交付状态的完整记录。'
            }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title} className="border-gray-200/80 bg-white/92 shadow-sm shadow-gray-900/5">
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-semibold tracking-tight text-gray-900">{item.title}</p>
                    <p className="text-sm leading-7 text-gray-600">{item.desc}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {appsQuery.isLoading || entitlementsQuery.isLoading || deploymentsQuery.isLoading ? (
        <Card className="rounded-lg border-gray-200/80 bg-white/95">
          <CardContent className="flex items-center justify-center gap-3 p-10 text-gray-500">
            <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
            正在加载部署数据...
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
          <section className="space-y-5">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Deployable Apps</p>
              <h2 className="text-3xl font-semibold tracking-tight text-gray-900">可继续交付的应用</h2>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              {deployableApps.map((option) => {
                const app = apps.find((item) => item.code === option.appCode);
                if (!app) {
                  return null;
                }
                return (
                  <DeployableAppCard
                    key={option.appCode}
                    app={app}
                    featureCount={option.featureCount}
                  />
                );
              })}
            </div>
          </section>

          <section className="space-y-5">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Deployment Wizard</p>
              <h2 className="text-3xl font-semibold tracking-tight text-gray-900">创建部署记录</h2>
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
              description="选择一个已购应用，创建部署记录后即可签发安装令牌并完成一键部署。"
            />
          ) : (
            <section className="space-y-5">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Deployment Records</p>
                <h2 className="text-3xl font-semibold tracking-tight text-gray-900">现有部署记录</h2>
              </div>
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
