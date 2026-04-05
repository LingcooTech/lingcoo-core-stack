import { Trash2 } from 'lucide-react';

import type { PlanSummary } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import {
  formatPlanInterval,
  formatPriceYuan,
  slugify,
  type EditableOffer,
  type EditableOfferUpdate,
} from './model';

interface AppEditOfferCardProps {
  offer: EditableOffer;
  index: number;
  availablePlans: PlanSummary[];
  availablePlanMap: Map<string, PlanSummary>;
  allPlans: PlanSummary[];
  updateOffer: EditableOfferUpdate;
  removeOffer: (offerId: string) => void;
  markDefaultOffer: (offerId: string) => void;
}

export function AppEditOfferCard({
  offer,
  index,
  availablePlans,
  availablePlanMap,
  allPlans,
  updateOffer,
  removeOffer,
  markDefaultOffer,
}: AppEditOfferCardProps) {
  const boundPlan =
    availablePlanMap.get(offer.planCode) ??
    allPlans.find((plan) => plan.code === offer.planCode) ??
    null;

  return (
    <div className="space-y-3 rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-black">{offer.title || `Offer ${index + 1}`}</p>
            {offer.isDefault ? (
              <Badge className="bg-amber-500 text-white hover:bg-amber-500">默认</Badge>
            ) : null}
          </div>
          <p className="text-xs font-mono text-muted-foreground">
            {offer.code || '未填写 Offer Code'}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => removeOffer(offer.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Offer Code</Label>
          <Input
            value={offer.code}
            onChange={(event) =>
              updateOffer(offer.id, (current) => ({
                ...current,
                code: slugify(event.target.value),
              }))
            }
            placeholder="offer_code"
          />
        </div>
        <div>
          <Label>绑定 Plan</Label>
          <Select
            value={offer.planCode}
            onValueChange={(value) =>
              updateOffer(offer.id, (current) => {
                const nextPlan = availablePlanMap.get(value);
                return {
                  ...current,
                  planCode: value,
                  currency: nextPlan?.currency || current.currency,
                  status: nextPlan?.status || current.status,
                  title: current.title || nextPlan?.name || '',
                  priceYuan: current.priceYuan || formatPriceYuan(nextPlan?.priceAmount),
                };
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="选择 Plan" />
            </SelectTrigger>
            <SelectContent>
              {availablePlans.map((plan) => (
                <SelectItem key={plan.code} value={plan.code}>
                  {plan.name} ({plan.code}) - {formatPlanInterval(plan.interval)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>展示标题</Label>
          <Input
            value={offer.title}
            onChange={(event) =>
              updateOffer(offer.id, (current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            placeholder="Pro 月付"
          />
        </div>
        <div>
          <Label>描述（可选）</Label>
          <Input
            value={offer.description}
            onChange={(event) =>
              updateOffer(offer.id, (current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            placeholder={
              boundPlan
                ? `${formatPlanInterval(boundPlan.interval)} - ${boundPlan.code}`
                : '简短说明'
            }
          />
        </div>
      </div>

      <div>
        <Label>标签（可选）</Label>
        <Input
          value={offer.badge}
          onChange={(event) =>
            updateOffer(offer.id, (current) => ({
              ...current,
              badge: event.target.value,
            }))
          }
          placeholder="限时优惠"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <Label>价格（元）</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={offer.priceYuan}
            onChange={(event) =>
              updateOffer(offer.id, (current) => ({
                ...current,
                priceYuan: event.target.value,
              }))
            }
          />
        </div>
        <div>
          <Label>币种</Label>
          <Input
            value={offer.currency}
            onChange={(event) =>
              updateOffer(offer.id, (current) => ({
                ...current,
                currency: event.target.value.toUpperCase(),
              }))
            }
          />
        </div>
        <div>
          <Label>状态</Label>
          <Select
            value={offer.status}
            onValueChange={(value) =>
              updateOffer(offer.id, (current) => ({ ...current, status: value }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant={offer.isDefault ? 'default' : 'outline'}
            className="w-full"
            onClick={() => markDefaultOffer(offer.id)}
          >
            {offer.isDefault ? '默认 Offer' : '设为默认'}
          </Button>
        </div>
      </div>
    </div>
  );
}
