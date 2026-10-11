import { QueryErrorState } from '@/components/portal/QueryErrorState';
import { usePageMetadata } from '@/lib/use-page-metadata';
import { hostingProfileSchema } from '@lingcoo/contracts';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Boxes, LoaderCircle, Rocket } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { listApps } from '@/api/apps';
import { ApiError } from '@/api/client';
import type {
  DeploymentSummary,
  DeploymentsResponse,
  IssueDeploymentTokenResult,
} from '@/api/types';
import {
  createDeployment,
  deactivateDeployment,
  issueDeploymentToken,
  listMyDeployments,
  listMyEntitlements,
  requestDeploymentAction,
  updateDeployment,
} from '@/api/user';
import { DeploymentEditDialog } from '@/components/portal/DeploymentEditDialog';
import { DeploymentRecordCard } from '@/components/portal/DeploymentRecordCard';
import { DeploymentWizard, type DeployableAppOption } from '@/components/portal/DeploymentWizard';
import { EmptyState } from '@/components/portal/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAppDeliveryMode, getDeliveryManifest } from '@/lib/app-delivery';

type DeploymentIssueDetails = {
  code?: string;
  missingDomains?: Array<{ label?: string }>;
  missingFields?: Array<{ label?: string }>;
};

function normalizeMeta(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function normalizeDeploymentPolicy(metaInput: unknown) {
  const meta = normalizeMeta(metaInput);
  const policy = normalizeMeta(meta.deploymentPolicy);
  const rawMax = policy.maxActiveDeployments;
  const parsedMax =
    typeof rawMax === 'number' ? rawMax : typeof rawMax === 'string' ? Number(rawMax) : Number.NaN;
  const source =
    typeof policy.domainBindingSource === 'string' &&
    policy.domainBindingSource.trim() &&
    policy.domainBindingSource !== 'none'
      ? policy.domainBindingSource.trim()
      : 'none';
  const mode =
    policy.domainBindingMode === 'lock_on_first_success' && source !== 'none'
      ? 'lock_on_first_success'
      : 'none';

  return {
    maxActiveDeployments: Number.isFinite(parsedMax) && parsedMax >= 1 ? Math.floor(parsedMax) : 1,
    domainBindingMode: mode,
    domainBindingSource: mode === 'none' ? 'none' : source,
    domainBindingScope:
      policy.domainBindingScope === 'exact_host' ? 'exact_host' : 'registrable_domain',
  } as const;
}

function isEffectiveEntitlement(item: { status: string; expiresAt: string | null }) {
  return (
    item.status === 'active' &&
    (!item.expiresAt || new Date(item.expiresAt).getTime() >= Date.now())
  );
}

export function DeploymentsPage() {
  usePageMetadata('应用部署');
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [issuedToken, setIssuedToken] = useState<IssueDeploymentTokenResult | null>(null);
  const [editingDeployment, setEditingDeployment] = useState<DeploymentSummary | null>(null);
  const appsQuery = useQuery({ queryKey: ['public-apps'], queryFn: listApps });
  const entitlementsQuery = useQuery({
    queryKey: ['my-entitlements'],
    queryFn: listMyEntitlements,
  });
  const deploymentsQuery = useQuery({
    queryKey: ['my-deployments'],
    queryFn: listMyDeployments,
    refetchInterval: 15000,
  });

  const apps = useMemo(() => appsQuery.data?.items ?? [], [appsQuery.data?.items]);
  const entitlements = useMemo(
    () => entitlementsQuery.data?.items ?? [],
    [entitlementsQuery.data?.items],
  );
  const deployments = useMemo(
    () => deploymentsQuery.data?.items ?? [],
    [deploymentsQuery.data?.items],
  );
  const summaryMap = useMemo(
    () =>
      new Map(
        (entitlementsQuery.data?.summary ?? []).map((entry) => [entry.appCode, entry.featureCodes]),
      ),
    [entitlementsQuery.data?.summary],
  );
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
                defaultInstallPath: manifest?.installer.installPath ?? '',
                entitlements: [],
              },
            ];
          }),
      ),
    [apps],
  );

  const deployableApps = useMemo<DeployableAppOption[]>(() => {
    const activeDeploymentCountByEntitlementId = new Map<string, number>();
    for (const deployment of deployments) {
      if (deployment.status !== 'active' || !deployment.entitlement?.id) {
        continue;
      }
      activeDeploymentCountByEntitlementId.set(
        deployment.entitlement.id,
        (activeDeploymentCountByEntitlementId.get(deployment.entitlement.id) ?? 0) + 1,
      );
    }

    return apps
      .filter((app) => getAppDeliveryMode(app) === 'one_click')
      .map((app) => {
        const manifest = getDeliveryManifest(app);
        const appEntitlements = entitlements
          .filter(
            (entitlement) =>
              entitlement.app?.code === app.code && isEffectiveEntitlement(entitlement),
          )
          .map((entitlement) => {
            const policy = normalizeDeploymentPolicy(entitlement.meta);
            const binding = normalizeMeta(normalizeMeta(entitlement.meta).domainBinding);
            return {
              id: entitlement.id,
              planCode: entitlement.plan?.code ?? '',
              planName: entitlement.plan?.name ?? '未命名套餐',
              expiresAt: entitlement.expiresAt,
              activeDeploymentCount: activeDeploymentCountByEntitlementId.get(entitlement.id) ?? 0,
              boundDomain:
                typeof binding.boundValue === 'string' && binding.boundValue.trim()
                  ? binding.boundValue.trim()
                  : null,
              ...policy,
            };
          });
        return {
          appCode: app.code,
          appName: app.name,
          appType: app.type,
          managedAvailable: hostingProfileSchema.safeParse(app.meta?.hostingProfile).success,
          featureCount: summaryMap.get(app.code)?.length ?? 0,
          manifest,
          defaultInstallPath: manifest?.installer.installPath ?? '',
          entitlements: appEntitlements,
        };
      })
      .filter((app) => app.entitlements.length > 0);
  }, [apps, deployments, entitlements, summaryMap]);

  const cacheDeployment = (deployment: DeploymentSummary) => {
    qc.setQueryData<DeploymentsResponse>(['my-deployments'], (current) => ({
      items: [deployment, ...(current?.items ?? []).filter((item) => item.id !== deployment.id)],
    }));
  };

  const createDeploymentMutation = useMutation({
    mutationFn: createDeployment,
    onSuccess: (result) => {
      cacheDeployment(result);
      toast.success('部署记录已创建');
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '创建部署记录失败');
    },
  });

  const updateDeploymentMutation = useMutation({
    mutationFn: updateDeployment,
    onSuccess: (result) => {
      cacheDeployment(result);
      toast.success('部署配置已更新');
      setEditingDeployment(null);
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
      setIssuedToken((current) => (current?.deploymentId === result.id ? null : current));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '更新部署配置失败');
    },
  });

  const issueTokenMutation = useMutation({
    mutationFn: issueDeploymentToken,
    onSuccess: (result) => {
      qc.setQueryData<DeploymentsResponse>(['my-deployments'], (current) =>
        current
          ? {
              items: current.items.map((deployment) =>
                deployment.id === result.deploymentId
                  ? {
                      ...deployment,
                      lastTokenIssuedAt: new Date().toISOString(),
                      latestToken: {
                        id: result.tokenId,
                        tokenHint: result.tokenHint,
                        status: 'active',
                        expiresAt: result.expiresAt,
                        usedAt: null,
                        createdAt: new Date().toISOString(),
                      },
                    }
                  : deployment,
              ),
            }
          : current,
      );
      setIssuedToken(result);
      toast.success('部署令牌已签发');
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
    },
    onError: (err, variables) => {
      const details =
        err instanceof ApiError ? (err.details as DeploymentIssueDetails | undefined) : undefined;
      if (details?.code === 'deployment_config_incomplete') {
        const target =
          deployments.find((deployment) => deployment.id === variables.deploymentId) ?? null;
        const missingLabels = [
          ...(details.missingDomains ?? []).map((item) => item.label).filter(Boolean),
          ...(details.missingFields ?? []).map((item) => item.label).filter(Boolean),
        ].slice(0, 3);

        setEditingDeployment(target);
        toast.error(
          missingLabels.length > 0
            ? `当前部署缺少必填配置：${missingLabels.join('、')}。请先补充后再签发安装令牌。`
            : '当前部署缺少新的必填配置，请先补充后再签发安装令牌。',
        );
        return;
      }

      toast.error(err instanceof Error ? err.message : '签发部署令牌失败');
    },
  });

  const deactivateDeploymentMutation = useMutation({
    mutationFn: deactivateDeployment,
    onSuccess: (result) => {
      cacheDeployment(result);
      toast.success('部署已停用');
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
      setIssuedToken(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '停用部署失败');
    },
  });

  const requestRuntimeUpdateMutation = useMutation({
    mutationFn: (deploymentId: string) =>
      requestDeploymentAction({ deploymentId, kind: 'apply_runtime_images' }),
    onSuccess: () => {
      toast.success('运行镜像更新动作已提交，等待服务器拉取执行');
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '提交运行镜像更新动作失败');
    },
  });

  const ignoreRuntimeUpdateMutation = useMutation({
    mutationFn: (deploymentId: string) =>
      requestDeploymentAction({ deploymentId, kind: 'ignore_runtime_images' }),
    onSuccess: () => {
      toast.success('运行镜像更新忽略动作已提交，等待服务器拉取执行');
      void qc.invalidateQueries({ queryKey: ['my-deployments'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '提交忽略运行镜像更新动作失败');
    },
  });

  const handleWizardCreate = async (
    payload: Parameters<typeof createDeployment>[0],
  ): Promise<{ id: string }> => {
    return await createDeploymentMutation.mutateAsync(payload);
  };

  const handleWizardIssueToken = async (params: {
    deploymentId: string;
    expiresInHours: number;
  }): Promise<IssueDeploymentTokenResult> => {
    return await issueTokenMutation.mutateAsync(params);
  };

  const editingAppOption = editingDeployment?.app?.code
    ? (oneClickAppMap.get(editingDeployment.app.code) ?? null)
    : null;
  const activeDeployments = deployments.filter((deployment) => deployment.status === 'active');
  const historicalDeployments = deployments.filter((deployment) => deployment.status !== 'active');
  const tokenReadyDeployments = deployments.filter((deployment) => Boolean(deployment.latestToken));
  const requestedAppCode = searchParams.get('app')?.trim() || '';
  const initialDeployAppCode = deployableApps.some((option) => option.appCode === requestedAppCode)
    ? requestedAppCode
    : undefined;
  const initialDeployApp = initialDeployAppCode
    ? (deployableApps.find((option) => option.appCode === initialDeployAppCode) ?? null)
    : null;
  const requestedApp = requestedAppCode
    ? (apps.find((app) => app.code === requestedAppCode) ?? null)
    : null;
  const requestedAppUnavailable =
    Boolean(requestedAppCode) &&
    !initialDeployAppCode &&
    Boolean(requestedApp && getAppDeliveryMode(requestedApp) === 'one_click');
  const loadError = appsQuery.error ?? entitlementsQuery.error ?? deploymentsQuery.error;
  const renderDeploymentCard = (deployment: DeploymentSummary) => (
    <DeploymentRecordCard
      key={deployment.id}
      deployment={deployment}
      issuedToken={issuedToken}
      issuing={
        issueTokenMutation.isPending && issueTokenMutation.variables?.deploymentId === deployment.id
      }
      applyingRuntimeUpdate={
        requestRuntimeUpdateMutation.isPending &&
        requestRuntimeUpdateMutation.variables === deployment.id
      }
      ignoringRuntimeUpdate={
        ignoreRuntimeUpdateMutation.isPending &&
        ignoreRuntimeUpdateMutation.variables === deployment.id
      }
      deactivating={
        deactivateDeploymentMutation.isPending &&
        deactivateDeploymentMutation.variables?.deploymentId === deployment.id
      }
      onIssueToken={(deploymentId) =>
        issueTokenMutation.mutate({ deploymentId, expiresInHours: 2 })
      }
      onEdit={(target) => setEditingDeployment(target)}
      onApplyRuntimeUpdate={(target) => {
        requestRuntimeUpdateMutation.mutate(target.id);
      }}
      onIgnoreRuntimeUpdate={(target) => {
        ignoreRuntimeUpdateMutation.mutate(target.id);
      }}
      onDeactivate={(target) => {
        if (
          !window.confirm(
            `停用 ${target.label} 后，将释放可用部署名额，并使当前安装令牌失效。确认继续吗？`,
          )
        ) {
          return;
        }
        deactivateDeploymentMutation.mutate({ deploymentId: target.id });
      }}
    />
  );

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">部署管理</h1>
          {initialDeployApp ? <Badge variant="secondary">{initialDeployApp.appName}</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {initialDeployApp
            ? `正在为 ${initialDeployApp.appName} 创建部署记录。`
            : '选择支持一键部署的应用并完成部署配置。'}
        </p>
        {requestedAppUnavailable ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {requestedApp?.name ?? requestedAppCode}{' '}
              当前没有可用部署授权。可能是授权已过期、被撤销，或订单尚未同步。
            </span>
          </div>
        ) : null}
      </div>

      {appsQuery.isLoading || entitlementsQuery.isLoading || deploymentsQuery.isLoading ? (
        <Card className="rounded-xl border-border bg-card">
          <CardContent className="flex items-center justify-center gap-3 p-10 text-muted-foreground">
            <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
            正在加载部署数据...
          </CardContent>
        </Card>
      ) : loadError ? (
        <QueryErrorState
          retry={() => {
            void appsQuery.refetch();
            void entitlementsQuery.refetch();
            void deploymentsQuery.refetch();
          }}
          busy={appsQuery.isFetching || entitlementsQuery.isFetching || deploymentsQuery.isFetching}
        />
      ) : deployableApps.length === 0 && deployments.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="暂无可部署的应用"
          description="购买支持一键部署的应用后，即可在这里开始部署。"
          action={
            <Button asChild size="sm">
              <Link to="/">
                浏览应用 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <Card className="rounded-xl border-border bg-card shadow-sm">
            <CardHeader className="space-y-2">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle className="text-xl tracking-tight">部署概览</CardTitle>
                  <CardDescription>
                    先确认可部署授权和已有实例，再为新客户站点创建部署记录。
                  </CardDescription>
                </div>
                {initialDeployApp ? (
                  <Badge variant="secondary" className="w-fit">
                    预选应用：{initialDeployApp.appName}
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: '可新建部署', value: String(deployableApps.length) },
                  { label: '运行中部署', value: String(activeDeployments.length) },
                  { label: '已签发令牌', value: String(tokenReadyDeployments.length) },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border bg-muted/60 px-4 py-3">
                    <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                    <p className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue={initialDeployApp ? 'create' : 'active'} className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <TabsList className="h-auto w-full flex-wrap justify-start sm:w-auto">
                <TabsTrigger value="active">运行中部署</TabsTrigger>
                <TabsTrigger value="create">新建部署</TabsTrigger>
                <TabsTrigger value="history">历史记录</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="active" className="mt-0 space-y-4">
              {activeDeployments.length > 0 ? (
                <div className="grid gap-4">{activeDeployments.map(renderDeploymentCard)}</div>
              ) : (
                <EmptyState
                  icon={Rocket}
                  title="暂无运行中的部署"
                  description="如果需要交付新的客户站点，请切换到「新建部署」。"
                />
              )}
            </TabsContent>

            <TabsContent value="create" className="mt-0 space-y-4">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-foreground">新建部署</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {initialDeployApp
                    ? `正在为 ${initialDeployApp.appName} 创建新实例。`
                    : '选择一个可部署应用，填写部署信息后签发安装令牌。'}
                </p>
              </div>
              {deployableApps.length > 0 ? (
                <DeploymentWizard
                  options={deployableApps}
                  initialAppCode={initialDeployAppCode}
                  onCreateDeployment={handleWizardCreate}
                  onIssueToken={handleWizardIssueToken}
                  creating={createDeploymentMutation.isPending}
                  issuing={issueTokenMutation.isPending}
                />
              ) : (
                <Card className="rounded-xl border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10">
                  <CardContent className="flex items-start gap-3 p-5 text-sm leading-6 text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      当前没有可用于新建部署的授权。需要新增客户站点时，请先购买新的授权实例。
                    </span>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-0 space-y-4">
              {historicalDeployments.length > 0 ? (
                <div className="grid gap-4">{historicalDeployments.map(renderDeploymentCard)}</div>
              ) : (
                <EmptyState
                  icon={Boxes}
                  title="暂无历史部署"
                  description="停用、过期或取消的部署会保留在这里，便于追溯。"
                />
              )}
            </TabsContent>
          </Tabs>
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
