import type { UpsertAppInput } from '@/api/apps';
import type { AppFaq, AppHighlight, AppLink, AppScreenshot, AppWithDetails } from '@/api/types';

export type AppEditTabKey = 'basics' | 'content' | 'plans' | 'offers' | 'delivery';

export const APP_EDIT_TABS: Array<{
  key: AppEditTabKey;
  label: string;
  description: string;
}> = [
  { key: 'basics', label: '基本信息', description: '名称、状态、分类和视觉素材' },
  { key: 'content', label: '展示内容', description: '详情正文、亮点、截图、FAQ 和外链' },
  { key: 'plans', label: '功能与套餐', description: '查看当前关联的 features 和 plans' },
  { key: 'offers', label: 'Offers', description: '管理应用售卖层的定价呈现' },
  { key: 'delivery', label: '交付配置', description: '跳转到交付设置页管理部署参数' },
];

export interface EditableOffer {
  id: string;
  code: string;
  planCode: string;
  title: string;
  description: string;
  badge: string;
  priceYuan: string;
  currency: string;
  status: string;
  isDefault: boolean;
}

export interface FormState {
  name: string;
  tagline: string;
  category: string;
  type: string;
  status: string;
  iconUrl: string;
  coverUrl: string;
  content: string;
  highlights: AppHighlight[];
  screenshots: AppScreenshot[];
  faq: AppFaq[];
  links: AppLink[];
}

export interface SaveRequest {
  payload: UpsertAppInput;
  snapshot: string;
}

export type AppEditFieldSetter = <K extends keyof FormState>(key: K, value: FormState[K]) => void;
export type EditableOfferUpdate = (
  offerId: string,
  updater: (offer: EditableOffer) => EditableOffer,
) => void;

export const EMPTY_FORM_STATE: FormState = {
  name: '',
  tagline: '',
  category: '',
  type: 'web_app',
  status: 'active',
  iconUrl: '',
  coverUrl: '',
  content: '',
  highlights: [],
  screenshots: [],
  faq: [],
  links: [],
};

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

export function formatPlanInterval(interval: string | null | undefined) {
  if (interval === 'month') return '月付';
  if (interval === 'year') return '年付';
  if (interval === 'one_time') return '一次性';
  return interval || '未设置';
}

export function createOfferId() {
  return `offer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createFormState(app: AppWithDetails): FormState {
  return {
    name: app.name,
    tagline: app.tagline ?? '',
    category: app.category ?? '',
    type: app.type,
    status: app.status,
    iconUrl: app.iconUrl ?? '',
    coverUrl: app.coverUrl ?? '',
    content: app.content ?? '',
    highlights: app.highlights?.length ? app.highlights.map((item) => ({ ...item })) : [],
    screenshots: app.screenshots?.length ? app.screenshots.map((item) => ({ ...item })) : [],
    faq: app.faq?.length ? app.faq.map((item) => ({ ...item })) : [],
    links: app.links?.length ? app.links.map((item) => ({ ...item })) : [],
  };
}

export function createEditableOffers(app: AppWithDetails): EditableOffer[] {
  return (app.checkoutOffers ?? []).map((offer) => ({
    id: createOfferId(),
    code: offer.code,
    planCode: offer.planCode,
    title: offer.title,
    description: offer.description ?? '',
    badge: offer.badge ?? '',
    priceYuan: formatPriceYuan(offer.priceAmount),
    currency: offer.currency,
    status: offer.status,
    isDefault: offer.isDefault,
  }));
}

export function serializeDraft(form: FormState, editableOffers: EditableOffer[]) {
  return JSON.stringify({
    form,
    editableOffers,
  });
}

export function buildSaveRequest(
  form: FormState,
  editableOffers: EditableOffer[],
  appMeta: Record<string, unknown> | undefined,
): SaveRequest {
  const offers = editableOffers
    .map((offer, index) => {
      const parsedPrice = Number.parseFloat(offer.priceYuan || '0');
      return {
        code: slugify(offer.code),
        planCode: offer.planCode,
        title: offer.title.trim(),
        description: offer.description.trim(),
        badge: offer.badge.trim(),
        priceAmount: Number.isFinite(parsedPrice) ? Math.round(parsedPrice * 100) : 0,
        currency: offer.currency.trim().toUpperCase() || 'CNY',
        status: offer.status,
        isDefault: offer.isDefault,
        sortOrder: index,
      };
    })
    .filter((offer) => offer.code && offer.planCode && offer.title);

  const meta = { ...(appMeta ?? {}) };
  delete meta.checkoutPlanCode;
  delete meta.checkoutOffers;
  delete meta.checkoutDefaultOfferCode;

  return {
    payload: {
      name: form.name.trim(),
      tagline: form.tagline || undefined,
      content: form.content || undefined,
      category: form.category || undefined,
      type: form.type,
      status: form.status,
      iconUrl: form.iconUrl || undefined,
      coverUrl: form.coverUrl || undefined,
      screenshots: form.screenshots.filter((item) => item.url.trim()),
      highlights: form.highlights.filter((item) => item.title.trim()),
      faq: form.faq.filter((item) => item.question.trim() && item.answer.trim()),
      links: form.links.filter((item) => item.label.trim() && item.url.trim()),
      offers,
      meta,
    },
    snapshot: serializeDraft(form, editableOffers),
  };
}
