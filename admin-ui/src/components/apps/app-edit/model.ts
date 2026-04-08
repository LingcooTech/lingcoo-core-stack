import type { UpsertAppInput } from '@/api/apps';
import type {
  AppFaq,
  AppHighlight,
  AppLink,
  AppScreenshot,
  AppWithDetails,
  PlanFeatureSummary,
  PlanSummary,
} from '@/api/types';
import { getAppDeliveryMode, type DeliveryMode } from '@/lib/app-delivery';

export type AppEditTabKey = 'basics' | 'content' | 'plans' | 'offers' | 'delivery';
export type EditableRecordStatus = 'active' | 'inactive' | 'cancelled' | 'expired';
export type EditablePlanInterval = 'month' | 'year' | 'one_time';

export const APP_EDIT_TABS: Array<{
  key: AppEditTabKey;
  label: string;
  description: string;
}> = [
  { key: 'basics', label: '基本信息', description: '名称、Code、状态、分类和视觉素材' },
  { key: 'content', label: '展示内容', description: '详情正文、亮点、截图、FAQ 和外链' },
  { key: 'plans', label: '功能与套餐', description: '创建并维护当前应用的 features 和 plans' },
  { key: 'offers', label: 'Offers', description: '管理应用售卖层的定价呈现' },
  { key: 'delivery', label: '交付配置', description: '直接维护该应用的一键部署参数和密钥状态' },
];

export interface EditableFeature {
  id: string;
  code: string;
  name: string;
  kind: string;
  status: EditableRecordStatus;
}

export interface EditablePlan {
  id: string;
  code: string;
  name: string;
  billingProvider: string;
  billingPriceId: string;
  priceYuan: string;
  currency: string;
  interval: EditablePlanInterval;
  status: EditableRecordStatus;
  featureCodes: string[];
}

export interface EditableOffer {
  id: string;
  code: string;
  planCode: string;
  title: string;
  description: string;
  badge: string;
  priceYuan: string;
  currency: string;
  status: EditableRecordStatus;
  isDefault: boolean;
}

export interface FormState {
  appCode: string;
  name: string;
  tagline: string;
  category: string;
  type: string;
  deliveryMode: DeliveryMode;
  status: EditableRecordStatus;
  iconUrl: string;
  coverUrl: string;
  content: string;
  highlights: AppHighlight[];
  screenshots: AppScreenshot[];
  faq: AppFaq[];
  links: AppLink[];
}

export type DeploymentDomainBindingSource = 'none' | 'primaryDomain' | 'adminDomain' | 'wsDomain';

export interface DeploymentPolicyDraft {
  domainBindingSource: DeploymentDomainBindingSource;
}

export interface SaveRequest {
  appCode: string;
  payload: UpsertAppInput;
  snapshot: string;
}

export interface DraftValidationIssue {
  tab: AppEditTabKey;
  message: string;
}

export type AppEditFieldSetter = <K extends keyof FormState>(key: K, value: FormState[K]) => void;
export type EditableFeatureUpdate = (
  featureId: string,
  updater: (feature: EditableFeature) => EditableFeature,
) => void;
export type EditablePlanUpdate = (
  planId: string,
  updater: (plan: EditablePlan) => EditablePlan,
) => void;
export type EditableOfferUpdate = (
  offerId: string,
  updater: (offer: EditableOffer) => EditableOffer,
) => void;

export const EMPTY_FORM_STATE: FormState = {
  appCode: '',
  name: '',
  tagline: '',
  category: '',
  type: 'web_app',
  deliveryMode: 'none',
  status: 'active',
  iconUrl: '',
  coverUrl: '',
  content: '',
  highlights: [],
  screenshots: [],
  faq: [],
  links: [],
};

function normalizeMetaRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function createDeploymentPolicyDraft(
  app?: Pick<AppWithDetails, 'meta'> | null
): DeploymentPolicyDraft {
  const meta = normalizeMetaRecord(app?.meta);
  const policy = normalizeMetaRecord(meta.deploymentPolicy);
  const source = typeof policy.domainBindingSource === 'string' ? policy.domainBindingSource : '';
  const legacyMode = typeof policy.domainBindingMode === 'string' ? policy.domainBindingMode : '';
  return {
    domainBindingSource:
      source === 'primaryDomain' || source === 'adminDomain' || source === 'wsDomain'
        ? source
        : legacyMode === 'frontend'
          ? 'primaryDomain'
          : 'none',
  };
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

export function formatPriceYuan(cents?: number) {
  return ((cents ?? 0) / 100).toFixed(2);
}

export function parsePriceYuanToCents(value: string) {
  const parsed = Number.parseFloat(value || '0');
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function formatPlanInterval(interval: string | null | undefined) {
  if (interval === 'month') return '月付';
  if (interval === 'year') return '年付';
  if (interval === 'one_time') return '一次性';
  return interval || '未设置';
}

export function normalizePlanInterval(interval: string | null | undefined): EditablePlanInterval {
  if (interval === 'year') return 'year';
  if (interval === 'one_time') return 'one_time';
  return 'month';
}

export function createDraftId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createFormState(app: AppWithDetails): FormState {
  return {
    appCode: app.code,
    name: app.name,
    tagline: app.tagline ?? '',
    category: app.category ?? '',
    type: app.type,
    deliveryMode: getAppDeliveryMode(app),
    status: (app.status as EditableRecordStatus) ?? 'active',
    iconUrl: app.iconUrl ?? '',
    coverUrl: app.coverUrl ?? '',
    content: app.content ?? '',
    highlights: app.highlights?.length ? app.highlights.map((item) => ({ ...item })) : [],
    screenshots: app.screenshots?.length ? app.screenshots.map((item) => ({ ...item })) : [],
    faq: app.faq?.length ? app.faq.map((item) => ({ ...item })) : [],
    links: app.links?.length ? app.links.map((item) => ({ ...item })) : [],
  };
}

export function createEditableFeatures(app: AppWithDetails): EditableFeature[] {
  return (app.features ?? []).map((feature) => ({
    id: feature.id,
    code: feature.code,
    name: feature.name,
    kind: feature.kind,
    status: (feature.status as EditableRecordStatus) ?? 'active',
  }));
}

export function createEditablePlans(
  app: AppWithDetails,
  planFeatures: PlanFeatureSummary[],
): EditablePlan[] {
  const featureCodeById = new Map((app.features ?? []).map((feature) => [feature.id, feature.code]));
  const featureCodesByPlanId = new Map<string, string[]>();

  for (const mapping of planFeatures) {
    const featureCode = featureCodeById.get(mapping.featureId);
    if (!featureCode) {
      continue;
    }
    if (!featureCodesByPlanId.has(mapping.planId)) {
      featureCodesByPlanId.set(mapping.planId, []);
    }
    featureCodesByPlanId.get(mapping.planId)?.push(featureCode);
  }

  return (app.plans ?? []).map((plan) => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    billingProvider: 'self_hosted',
    billingPriceId: '',
    priceYuan: formatPriceYuan(plan.priceAmount),
    currency: plan.currency ?? 'CNY',
    interval: normalizePlanInterval(plan.interval),
    status: (plan.status as EditableRecordStatus) ?? 'active',
    featureCodes: [...new Set(featureCodesByPlanId.get(plan.id) ?? [])],
  }));
}

export function createEditableOffers(app: AppWithDetails): EditableOffer[] {
  return (app.checkoutOffers ?? []).map((offer) => ({
    id: createDraftId('offer'),
    code: offer.code,
    planCode: offer.planCode,
    title: offer.title,
    description: offer.description ?? '',
    badge: offer.badge ?? '',
    priceYuan: formatPriceYuan(offer.priceAmount),
    currency: offer.currency,
    status: (offer.status as EditableRecordStatus) ?? 'active',
    isDefault: offer.isDefault,
  }));
}

export function serializeDraft(
  form: FormState,
  editableFeatures: EditableFeature[],
  editablePlans: EditablePlan[],
  editableOffers: EditableOffer[],
  deliveryDraft?: unknown,
) {
  return JSON.stringify({
    form,
    editableFeatures,
    editablePlans,
    editableOffers,
    deliveryDraft: deliveryDraft ?? null,
  });
}

export function toPlanSummary(plan: EditablePlan, appId?: string): PlanSummary {
  return {
    id: plan.id,
    code: slugify(plan.code),
    name: plan.name.trim(),
    interval: plan.interval,
    priceAmount: parsePriceYuanToCents(plan.priceYuan),
    currency: plan.currency.trim().toUpperCase() || 'CNY',
    status: plan.status,
    appId,
  };
}

function validateUniqueCodes(
  codes: string[],
  label: string,
  tab: AppEditTabKey,
): DraftValidationIssue | null {
  const seen = new Set<string>();
  for (const code of codes) {
    if (seen.has(code)) {
      return {
        tab,
        message: `${label} Code 不能重复：${code}`,
      };
    }
    seen.add(code);
  }
  return null;
}

export function validateDraft(
  form: FormState,
  editableFeatures: EditableFeature[],
  editablePlans: EditablePlan[],
  editableOffers: EditableOffer[],
): DraftValidationIssue | null {
  const normalizedAppCode = slugify(form.appCode);
  if (!normalizedAppCode) {
    return {
      tab: 'basics',
      message: '请填写 App Code，使用英文、数字或下划线。',
    };
  }
  if (!form.name.trim()) {
    return {
      tab: 'basics',
      message: '请填写应用名称。',
    };
  }
  if (!form.type.trim()) {
    return {
      tab: 'basics',
      message: '请填写应用类型。',
    };
  }

  const featureCodes = editableFeatures.map((feature) => slugify(feature.code));
  const planCodes = editablePlans.map((plan) => slugify(plan.code));
  const offerCodes = editableOffers.map((offer) => slugify(offer.code));

  const duplicateFeatureCode = validateUniqueCodes(
    featureCodes.filter(Boolean),
    '功能',
    'plans',
  );
  if (duplicateFeatureCode) {
    return duplicateFeatureCode;
  }

  const duplicatePlanCode = validateUniqueCodes(planCodes.filter(Boolean), '套餐', 'plans');
  if (duplicatePlanCode) {
    return duplicatePlanCode;
  }

  const duplicateOfferCode = validateUniqueCodes(offerCodes.filter(Boolean), 'Offer', 'offers');
  if (duplicateOfferCode) {
    return duplicateOfferCode;
  }

  const validFeatureCodeSet = new Set(featureCodes.filter(Boolean));

  for (const [index, feature] of editableFeatures.entries()) {
    if (!slugify(feature.code)) {
      return {
        tab: 'plans',
        message: `功能 ${index + 1} 缺少有效 Code。`,
      };
    }
    if (!feature.name.trim()) {
      return {
        tab: 'plans',
        message: `功能 ${index + 1} 缺少名称。`,
      };
    }
  }

  if (editablePlans.length > 0 && editableFeatures.length === 0) {
    return {
      tab: 'plans',
      message: '请先创建至少一个功能，再创建套餐。',
    };
  }

  for (const [index, plan] of editablePlans.entries()) {
    if (!slugify(plan.code)) {
      return {
        tab: 'plans',
        message: `套餐 ${index + 1} 缺少有效 Code。`,
      };
    }
    if (!plan.name.trim()) {
      return {
        tab: 'plans',
        message: `套餐 ${index + 1} 缺少名称。`,
      };
    }
    if (plan.featureCodes.length === 0) {
      return {
        tab: 'plans',
        message: `套餐 ${index + 1} 至少要关联一个功能。`,
      };
    }
    if (!plan.featureCodes.every((code) => validFeatureCodeSet.has(slugify(code)))) {
      return {
        tab: 'plans',
        message: `套餐 ${index + 1} 关联了不存在的功能 Code。`,
      };
    }
  }

  if (editableOffers.length > 0 && editablePlans.length === 0) {
    return {
      tab: 'offers',
      message: '请先创建至少一个套餐，再配置 Offer。',
    };
  }

  const validPlanCodeSet = new Set(planCodes.filter(Boolean));
  for (const [index, offer] of editableOffers.entries()) {
    if (!slugify(offer.code)) {
      return {
        tab: 'offers',
        message: `Offer ${index + 1} 缺少有效 Code。`,
      };
    }
    if (!offer.title.trim()) {
      return {
        tab: 'offers',
        message: `Offer ${index + 1} 缺少展示标题。`,
      };
    }
    if (!validPlanCodeSet.has(slugify(offer.planCode))) {
      return {
        tab: 'offers',
        message: `Offer ${index + 1} 没有绑定有效套餐。`,
      };
    }
  }

  return null;
}

export function buildSaveRequest(
  form: FormState,
  editableFeatures: EditableFeature[],
  editablePlans: EditablePlan[],
  editableOffers: EditableOffer[],
  appMeta: Record<string, unknown> | undefined,
  deploymentPolicy: DeploymentPolicyDraft,
): SaveRequest {
  const normalizedAppCode = slugify(form.appCode);

  const features = editableFeatures.map((feature) => ({
    code: slugify(feature.code),
    name: feature.name.trim(),
    kind: feature.kind.trim() || 'boolean',
    status: feature.status,
  }));

  const plans = editablePlans.map((plan) => ({
    code: slugify(plan.code),
    name: plan.name.trim(),
    billingProvider: plan.billingProvider.trim() || 'self_hosted',
    billingPriceId: plan.billingPriceId.trim() || undefined,
    priceAmount: parsePriceYuanToCents(plan.priceYuan),
    currency: plan.currency.trim().toUpperCase() || 'CNY',
    interval: plan.interval,
    status: plan.status,
    featureCodes: plan.featureCodes.map((code) => slugify(code)).filter(Boolean),
    meta: {},
  }));

  const offers = editableOffers.map((offer, index) => ({
    code: slugify(offer.code),
    planCode: slugify(offer.planCode),
    title: offer.title.trim(),
    description: offer.description.trim() || undefined,
    badge: offer.badge.trim() || undefined,
    priceAmount: parsePriceYuanToCents(offer.priceYuan),
    currency: offer.currency.trim().toUpperCase() || 'CNY',
    status: offer.status,
    isDefault: offer.isDefault,
    sortOrder: index,
  }));

  const meta = { ...(appMeta ?? {}) };
  delete meta.checkoutPlanCode;
  delete meta.checkoutOffers;
  delete meta.checkoutDefaultOfferCode;
  meta.deliveryMode = form.deliveryMode;
  meta.deploymentPolicy = {
    ...normalizeMetaRecord(meta.deploymentPolicy),
    domainBindingSource: deploymentPolicy.domainBindingSource,
  };

  return {
    appCode: normalizedAppCode,
    payload: {
      name: form.name.trim(),
      tagline: form.tagline || undefined,
      content: form.content || undefined,
      category: form.category || undefined,
      type: form.type.trim(),
      status: form.status,
      iconUrl: form.iconUrl || undefined,
      coverUrl: form.coverUrl || undefined,
      screenshots: form.screenshots.filter((item) => item.url.trim()),
      highlights: form.highlights.filter((item) => item.title.trim()),
      faq: form.faq.filter((item) => item.question.trim() && item.answer.trim()),
      links: form.links.filter((item) => item.label.trim() && item.url.trim()),
      features,
      plans,
      offers,
      meta,
    },
    snapshot: serializeDraft(form, editableFeatures, editablePlans, editableOffers),
  };
}
