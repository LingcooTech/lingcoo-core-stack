import { Plus } from 'lucide-react';

import type { PlanSummary } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { TabsContent } from '@/components/ui/tabs';
import { formatAmount } from '@/lib/utils';

import { AppEditOfferCard } from './AppEditOfferCard';
import { AppEditSaveBar } from './AppEditSaveBar';
import { formatPlanInterval, type EditableOffer, type EditableOfferUpdate } from './model';

interface AppEditOffersTabProps {
  availablePlans: PlanSummary[];
  availablePlanMap: Map<string, PlanSummary>;
  allPlans: PlanSummary[];
  editableOffers: EditableOffer[];
  updateOffer: EditableOfferUpdate;
  addOffer: () => void;
  removeOffer: (offerId: string) => void;
  markDefaultOffer: (offerId: string) => void;
  isSaving: boolean;
  saveDisabled: boolean;
  onSave: () => void;
}

export function AppEditOffersTab({
  availablePlans,
  availablePlanMap,
  allPlans,
  editableOffers,
  updateOffer,
  addOffer,
  removeOffer,
  markDefaultOffer,
  isSaving,
  saveDisabled,
  onSave,
}: AppEditOffersTabProps) {
  return (
    <TabsContent value="offers" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Offers</CardTitle>
          <CardDescription>
            每个 Offer 绑定一个基础 Plan，但展示标题、标签和价格可以按应用单独配置。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="mb-2 block">可绑定套餐</Label>
            {availablePlans.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无关联套餐，无法创建 Offer。</p>
            ) : (
              <div className="space-y-2">
                {availablePlans.map((plan) => (
                  <div key={plan.code} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono">{plan.code}</span>
                    <span className="text-muted-foreground">{plan.name}</span>
                    <Badge variant="outline">{formatPlanInterval(plan.interval)}</Badge>
                    {typeof plan.priceAmount === 'number' ? (
                      <Badge variant="outline">
                        {formatAmount(plan.priceAmount, plan.currency ?? 'CNY')}
                      </Badge>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">应用售卖梯度</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  默认 Offer 会在前台优先展示。
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOffer}
                disabled={availablePlans.length === 0}
              >
                <Plus className="h-4 w-4" />
                添加 Offer
              </Button>
            </div>

            {editableOffers.length === 0 && availablePlans.length > 0 ? (
              <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                尚未配置自定义 Offer，前端将回退到基础 Plan 展示。
              </div>
            ) : null}

            {editableOffers.map((offer, index) => (
              <AppEditOfferCard
                key={offer.id}
                offer={offer}
                index={index}
                availablePlans={availablePlans}
                availablePlanMap={availablePlanMap}
                allPlans={allPlans}
                updateOffer={updateOffer}
                removeOffer={removeOffer}
                markDefaultOffer={markDefaultOffer}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <AppEditSaveBar
        title="保存 Offers"
        description="保存后会更新前台售卖页的展示文案和价格层。"
        isSaving={isSaving}
        disabled={saveDisabled}
        onSave={onSave}
      />
    </TabsContent>
  );
}
