import { useQuery } from '@tanstack/react-query';
import { ArrowRight, KeyRound, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { listApps } from '@/api/apps';
import { listMyEntitlements } from '@/api/user';
import { EmptyState } from '@/components/portal/EmptyState';
import { EntitlementProductCard } from '@/components/portal/EntitlementProductCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getAppDeliveryMode } from '@/lib/app-delivery';
import { getAccessLinks } from '@/lib/app-catalog-ui';

export function MyAccessPage() {
  const entitlementsQuery = useQuery({
    queryKey: ['my-entitlements'],
    queryFn: listMyEntitlements,
  });
  const appsQuery = useQuery({ queryKey: ['public-apps'], queryFn: listApps });

  const summary = entitlementsQuery.data?.summary ?? [];
  const items = entitlementsQuery.data?.items ?? [];
  const apps = appsQuery.data?.items ?? [];
  const appByCode = new Map(apps.map((app) => [app.code, app]));

  const appsByProduct = new Map<string, string[]>();
  for (const app of apps) {
    if (!appsByProduct.has(app.code)) {
      appsByProduct.set(app.code, []);
    }
    appsByProduct.get(app.code)?.push(app.name);
  }

  const featureNameMap = new Map<string, string>();
  for (const item of items) {
    if (item.plan?.code && item.plan?.name) {
      featureNameMap.set(item.plan.code, item.plan.name);
    }
  }

  const activeItems = items.filter((item) => item.status === 'active');

  const deployableCount = summary.filter((entry) => {
    const app = appByCode.get(entry.appCode);
    return Boolean(app && getAppDeliveryMode(app) === 'one_click');
  }).length;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">我的应用</h1>
        <p className="text-sm text-muted-foreground">查看已购应用和可用能力。</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: '已购应用', value: String(summary.length) },
          { label: '激活授权', value: String(activeItems.length) },
          { label: '可部署应用', value: String(deployableCount) },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm"
          >
            <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
            <p className="mt-1.5 text-[1.75rem] font-semibold tracking-tight text-foreground">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {entitlementsQuery.isLoading ? (
        <Card className="rounded-xl border-border bg-card">
          <CardContent className="flex items-center justify-center gap-3 p-10 text-muted-foreground">
            <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
            正在加载授权状态...
          </CardContent>
        </Card>
      ) : summary.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="还没有已购应用"
          description="去应用中心挑一款工具，开通后会自动出现在这里。"
          action={
            <Button asChild size="sm">
              <Link to="/">
                浏览应用 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        />
      ) : (
        <section className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">已购产品</h2>
            <p className="text-sm text-muted-foreground">
              优先展示当前可用入口；授权历史和订单来源作为次级信息保留在卡片内。
            </p>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            {summary.map((entry) => {
              const relatedItems = items.filter((item) => item.app?.code === entry.appCode);
              const activeRelatedItems = relatedItems.filter((item) => item.status === 'active');
              const relatedApps = appsByProduct.get(entry.appCode) ?? [];
              const app = appByCode.get(entry.appCode) ?? null;
              const featureNames = entry.featureCodes.map(
                (code) => featureNameMap.get(code) ?? code,
              );
              const isDeployable = Boolean(app && getAppDeliveryMode(app) === 'one_click');
              const deploymentHref =
                activeRelatedItems.length > 0 && isDeployable
                  ? `/deploy?app=${encodeURIComponent(entry.appCode)}`
                  : undefined;
              const accessLinks =
                activeRelatedItems.length > 0 && app && !isDeployable
                  ? getAccessLinks(app.links)
                  : [];

              return (
                <EntitlementProductCard
                  key={entry.appCode}
                  productName={relatedItems[0]?.app?.name ?? entry.appCode}
                  featureNames={featureNames}
                  relatedApps={relatedApps}
                  items={relatedItems}
                  deploymentHref={deploymentHref}
                  accessLinks={accessLinks}
                  appHref={`/apps/${entry.appCode}`}
                  accessState={activeRelatedItems.length > 0 ? 'active' : 'inactive'}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
