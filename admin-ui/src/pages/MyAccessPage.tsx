import { useQuery } from '@tanstack/react-query';
import { Boxes, KeyRound, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react';

import { listApps } from '@/api/apps';
import { listMyEntitlements } from '@/api/user';
import { EmptyState } from '@/components/portal/EmptyState';
import { EntitlementProductCard } from '@/components/portal/EntitlementProductCard';
import { Card, CardContent } from '@/components/ui/card';

export function MyAccessPage() {
  const entitlementsQuery = useQuery({ queryKey: ['my-entitlements'], queryFn: listMyEntitlements });
  const appsQuery = useQuery({ queryKey: ['public-apps'], queryFn: listApps });

  const summary = entitlementsQuery.data?.summary ?? [];
  const items = entitlementsQuery.data?.items ?? [];
  const apps = appsQuery.data?.items ?? [];

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

  return (
    <div className="space-y-10">
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr),360px]">
        <div className="rounded-lg border border-gray-200/80 bg-white/92 p-8 shadow-sm shadow-gray-900/5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Entitlements</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">我的应用</h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-gray-600">
            这里应该像正式产品后台里的“已购产品与能力中心”，而不是简单的数据回显。
            用户会在这里确认自己买到了什么、当前解锁了哪些能力、哪些应用已经可以继续使用或部署。
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              {
                label: '已购应用',
                value: String(summary.length),
                note: '当前账户下已产生授权摘要的应用'
              },
              {
                label: '激活授权',
                value: String(activeItems.length),
                note: '正在生效中的 entitlement 记录'
              },
              {
                label: '解锁能力',
                value: String(summary.reduce((count, entry) => count + entry.featureCodes.length, 0)),
                note: '用于 WordPress、Notion、部署等后续入口'
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
              icon: ShieldCheck,
              title: '授权状态',
              desc: '当前页面优先回答“哪些产品已解锁”，而不是先展示底层表字段。'
            },
            {
              icon: Sparkles,
              title: '能力可见性',
              desc: '解锁的能力项应该直接可见，便于用户理解当前套餐到底打开了什么。'
            },
            {
              icon: Boxes,
              title: '后续入口',
              desc: '购买后的真正下一步通常是继续使用、继续部署，而不是停留在订单页。'
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

      {entitlementsQuery.isLoading ? (
        <Card className="rounded-lg border-gray-200/80 bg-white/95">
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
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Purchased Products</p>
            <h2 className="text-3xl font-semibold tracking-tight text-gray-900">已购产品与能力</h2>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {summary.map((entry) => {
              const relatedItems = items.filter((item) => item.app?.code === entry.appCode);
              const relatedApps = appsByProduct.get(entry.appCode) ?? [];
              const featureNames = entry.featureCodes.map(
                (code) => featureNameMap.get(code) ?? code
              );

              return (
                <EntitlementProductCard
                  key={entry.appCode}
                  productName={relatedItems[0]?.app?.name ?? entry.appCode}
                  featureNames={featureNames}
                  relatedApps={relatedApps}
                  items={relatedItems}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
