import { useQuery } from '@tanstack/react-query';
import { KeyRound, LoaderCircle } from 'lucide-react';

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
    for (const product of app.products ?? []) {
      if (!appsByProduct.has(product.code)) {
        appsByProduct.set(product.code, []);
      }
      appsByProduct.get(product.code)?.push(app.name);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2 pt-4">
        <h1 className="text-4xl font-black tracking-tight text-slate-950">我的应用</h1>
        <p className="text-lg text-muted-foreground">已购应用和授权状态</p>
      </section>

      {entitlementsQuery.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : summary.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="还没有已购应用"
          description="还没有已购应用，去应用中心选购吧"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {summary.map((entry) => {
            const relatedItems = items.filter((item) => item.product?.code === entry.productCode);
            const relatedApps = appsByProduct.get(entry.productCode) ?? [];

            return (
              <EntitlementProductCard
                key={entry.productCode}
                productCode={entry.productCode}
                productName={relatedItems[0]?.product?.name ?? entry.productCode}
                featureCodes={entry.featureCodes}
                relatedApps={relatedApps}
                items={relatedItems}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
