import { useQuery } from '@tanstack/react-query';
import { KeyRound, LoaderCircle } from 'lucide-react';

import { listApps } from '@/api/apps';
import { listMyEntitlements } from '@/api/user';
import { EmptyState } from '@/components/portal/EmptyState';
import { EntitlementProductCard } from '@/components/portal/EntitlementProductCard';
import { MetricStrip } from '@/components/portal/MetricStrip';
import { PageHeader } from '@/components/portal/PageHeader';
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
    <div className="space-y-6">
      <PageHeader sectionKey="access" />

      <MetricStrip
        items={[
          { label: 'Products', value: summary.length, note: '按产品聚合后的有效授权数量。' },
          { label: 'Entitlements', value: items.length, note: '当前账号下 entitlement 明细数量。' },
          {
            label: 'Mapped Apps',
            value: summary.filter((entry) => (appsByProduct.get(entry.productCode) ?? []).length > 0).length,
            note: '这些授权已经能映射到具体应用，后续可继续承接部署与更新。'
          },
          { label: 'View Mode', value: 'Product-first', note: '先按产品聚合，再展开 feature 和后续交付权限。' }
        ]}
      />

      {entitlementsQuery.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : summary.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="当前没有可用授权"
          description="购买成功后，这里会显示产品能力、权限边界，以及后续的部署资格与更新权。"
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
