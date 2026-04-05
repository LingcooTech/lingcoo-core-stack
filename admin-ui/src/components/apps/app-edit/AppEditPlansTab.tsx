import { Package, Sparkles } from 'lucide-react';

import type { FeatureSummary, PlanSummary } from '@/api/types';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { formatAmount } from '@/lib/utils';

import { formatPlanInterval } from './model';

interface AppEditPlansTabProps {
  features: FeatureSummary[];
  plans: PlanSummary[];
}

export function AppEditPlansTab({ features, plans }: AppEditPlansTabProps) {
  return (
    <TabsContent value="plans" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>功能概览</CardTitle>
          <CardDescription>当前应用已关联的功能列表。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {features.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
              当前没有关联 feature。
            </div>
          ) : (
            features.map((feature) => (
              <div
                key={feature.id}
                className="flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-black">{feature.name}</p>
                    <Badge variant="outline">{feature.kind}</Badge>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground">{feature.code}</p>
                </div>
                <StatusPill
                  tone={statusToTone(feature.status ?? 'inactive')}
                  label={feature.status ?? 'inactive'}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>套餐概览</CardTitle>
          <CardDescription>这里展示关联 plan；售卖层展示文案在 Offers Tab 单独配置。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {plans.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
              当前没有关联 plan。
            </div>
          ) : (
            plans.map((plan) => (
              <div
                key={plan.id}
                className="flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-black">{plan.name}</p>
                    <Badge variant="outline">{formatPlanInterval(plan.interval)}</Badge>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground">{plan.code}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {typeof plan.priceAmount === 'number' ? (
                    <Badge variant="outline">
                      {formatAmount(plan.priceAmount, plan.currency ?? 'CNY')}
                    </Badge>
                  ) : null}
                  <StatusPill tone={statusToTone(plan.status ?? 'inactive')} label={plan.status ?? 'inactive'} />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
