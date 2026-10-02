import type { AppWithDetails } from '@/api/types';

export type AppPurchaseType = 'free' | 'onsite_onetime' | 'onsite_subscription' | 'offsite';

export interface AppDetailSubscriptionPlan {
  period: string;
  price: string;
  description: string;
}

export interface AppDetailProfile {
  developer: string;
  version: string;
  updateDate: string;
  size: string;
  platforms: string[];
  languages: string;
  systemRequirements: string;
  technicalNotes: string;
  purchaseType: AppPurchaseType;
  price: string;
  purchaseUrl: string;
  usageInstructions: string;
  trialDays: number;
  notes: string;
  subscriptionPlans: AppDetailSubscriptionPlan[];
}

export const EMPTY_APP_DETAIL_PROFILE: AppDetailProfile = {
  developer: '',
  version: '',
  updateDate: '',
  size: '',
  platforms: [],
  languages: '',
  systemRequirements: '',
  technicalNotes: '',
  purchaseType: 'free',
  price: '',
  purchaseUrl: '',
  usageInstructions: '',
  trialDays: 0,
  notes: '',
  subscriptionPlans: [],
};

function normalizeMetaRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean);
  }

  const single = normalizeString(value);
  if (!single) {
    return [];
  }

  return single
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePurchaseType(value: unknown): AppPurchaseType {
  const normalized = normalizeString(value);
  if (
    normalized === 'onsite_onetime' ||
    normalized === 'onsite_subscription' ||
    normalized === 'offsite'
  ) {
    return normalized;
  }

  return 'free';
}

function normalizeTrialDays(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }

  return 0;
}

function normalizeSubscriptionPlans(value: unknown): AppDetailSubscriptionPlan[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const raw = normalizeMetaRecord(item);
      const period = normalizeString(raw.period);
      const price = normalizeString(raw.price);
      const description = normalizeString(raw.description);

      if (!period && !price && !description) {
        return null;
      }

      return {
        period,
        price,
        description,
      } satisfies AppDetailSubscriptionPlan;
    })
    .filter((item): item is AppDetailSubscriptionPlan => Boolean(item));
}

export function getAppDetailProfile(app?: Pick<AppWithDetails, 'meta'> | null): AppDetailProfile {
  const meta = normalizeMetaRecord(app?.meta);
  const raw = normalizeMetaRecord(meta.appDetail);

  return {
    developer: normalizeString(raw.developer),
    version: normalizeString(raw.version),
    updateDate: normalizeString(raw.updateDate),
    size: normalizeString(raw.size),
    platforms: normalizeStringArray(raw.platforms),
    languages: normalizeString(raw.languages),
    systemRequirements: normalizeString(raw.systemRequirements),
    technicalNotes: normalizeString(raw.technicalNotes),
    purchaseType: normalizePurchaseType(raw.purchaseType),
    price: normalizeString(raw.price),
    purchaseUrl: normalizeString(raw.purchaseUrl),
    usageInstructions: normalizeString(raw.usageInstructions),
    trialDays: normalizeTrialDays(raw.trialDays),
    notes: normalizeString(raw.notes),
    subscriptionPlans: normalizeSubscriptionPlans(raw.subscriptionPlans),
  };
}

export function hasAppDetailProfileContent(profile: AppDetailProfile) {
  return Boolean(
    profile.developer ||
    profile.version ||
    profile.updateDate ||
    profile.size ||
    profile.platforms.length ||
    profile.languages ||
    profile.systemRequirements ||
    profile.technicalNotes ||
    profile.purchaseType !== 'free' ||
    profile.price ||
    profile.purchaseUrl ||
    profile.usageInstructions ||
    profile.trialDays > 0 ||
    profile.notes ||
    profile.subscriptionPlans.length,
  );
}

export function splitMultilineText(value: string) {
  return value
    .split(/<br\s*\/?>|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}
