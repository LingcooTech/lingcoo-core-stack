import { useQuery } from '@tanstack/react-query';
import { KeyRound, LoaderCircle } from 'lucide-react';

import { listApps } from '@/api/apps';
import { listMyEntitlements } from '@/api/user';
import { EmptyState } from '@/components/portal/EmptyState';
import { EntitlementProductCard } from '@/components/portal/EntitlementProductCard';
import { Card, CardContent } from '@/components/ui/card';
import { getAppDeliveryMode } from '@/lib/app-delivery';
import { getAccessLinks } from '@/lib/app-catalog-ui';

export function MyAccessPage() {
  const entitlementsQuery = useQuery({ queryKey: ['my-entitlements'], queryFn: listMyEntitlements });
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
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight text-gray-900">我的应用</h1>
        <p className="text-sm text-gray-500">查看已购应用和可用能力。</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: '已购应用', value: String(summary.length) },
          { label: '激活授权', value: String(activeItems.length) },
          { label: '可部署应用', value: String(deployableCount) }
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-gray-500">{item.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>

      {entitlementsQuery.isLoading ? (
        <Card className="rounded-xl border-gray-200 bg-white">
          <CardContent className="flex items-center justify-center gap-3 p-10 text-gray-500">
            <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
            正在加载授权状态...
          </CardContent>
        </Card>
      ) : summary.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="还没有已购应用"
          description="还没有已购应用，去应用中心选购吧。"
        />
      ) : (
        <section className="space-y-5">
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">已购产品</h2>
          <div className="grid gap-5 lg:grid-cols-2">
            {summary.map((entry) => {
              const relatedItems = items.filter((item) => item.app?.code === entry.appCode);
              const relatedApps = appsByProduct.get(entry.appCode) ?? [];
              const app = appByCode.get(entry.appCode) ?? null;
              const featureNames = entry.featureCodes.map(
                (code) => featureNameMap.get(code) ?? code
              );
              const isDeployable = Boolean(app && getAppDeliveryMode(app) === 'one_click');
              const deploymentHref = isDeployable ? `/deploy?app=${encodeURIComponent(entry.appCode)}` : undefined;
              const accessLinks = app && !isDeployable ? getAccessLinks(app.links) : [];

              return (
                <EntitlementProductCard
                  key={entry.appCode}
                  productName={relatedItems[0]?.app?.name ?? entry.appCode}
                  featureNames={featureNames}
                  relatedApps={relatedApps}
                  items={relatedItems}
                  deploymentHref={deploymentHref}
                  accessLinks={accessLinks}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
