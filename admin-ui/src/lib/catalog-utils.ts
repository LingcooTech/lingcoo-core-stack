import { z } from 'zod';
import type { AppWithDetails, PlanSummary } from '@/api/types';

export const appSchema = z.object({
  name: z.string().min(1, '应用名称不能为空'),
  description: z.string().optional(),
  type: z.string().trim().min(1).max(64),
  status: z.enum(['active', 'inactive', 'cancelled', 'expired']),
});
export type AppFormValues = z.infer<typeof appSchema>;

export type EditableOffer = {
  id: string;
  code: string;
  planCode: string;
  title: string;
  description: string;
  badge: string;
  priceYuan: string;
  currency: string;
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
  isDefault: boolean;
};

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

export function formatPriceYuan(priceAmount?: number) {
  return ((priceAmount ?? 0) / 100).toFixed(2);
}

export function formatPlanInterval(interval: string | null | undefined) {
  if (interval === 'month') return '月付';
  if (interval === 'year') return '年付';
  if (interval === 'one_time') return '一次性';
  return interval || '未设置';
}

export function createOfferId() {
  return `offer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyOffer(plan?: PlanSummary): EditableOffer {
  return {
    id: createOfferId(),
    code: slugify(plan?.code || `offer_${Date.now().toString(36)}`),
    planCode: plan?.code || '',
    title: plan?.name || '',
    description: '',
    badge: '',
    priceYuan: formatPriceYuan(plan?.priceAmount),
    currency: plan?.currency || 'CNY',
    status: (plan?.status as EditableOffer['status']) || 'active',
    isDefault: false,
  };
}

export function offersFromApp(app: AppWithDetails | null): EditableOffer[] {
  return (app?.checkoutOffers ?? []).map((offer) => ({
    id: createOfferId(),
    code: offer.code,
    planCode: offer.planCode,
    title: offer.title,
    description: offer.description || '',
    badge: offer.badge || '',
    priceYuan: formatPriceYuan(offer.priceAmount),
    currency: offer.currency,
    status: offer.status as EditableOffer['status'],
    isDefault: offer.isDefault,
  }));
}
