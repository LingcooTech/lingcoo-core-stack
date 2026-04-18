import type { AppCatalog, AppWithDetails, AppLink } from '@/api/types';
import { formatAmount } from '@/lib/utils';

type AppOffer = AppWithDetails['checkoutOffers'][number];
type CatalogOffer = AppCatalog['offers'][number];
type OfferLike = AppOffer | CatalogOffer;

function formatOfferPriceAmount(priceAmount: number, currency: string) {
  if (priceAmount <= 0) {
    return '免费';
  }

  return formatAmount(priceAmount, currency);
}

export function getAppTypeLabel(type: string | null | undefined) {
  switch (type) {
    case 'extension':
    case 'chrome_extension':
      return '浏览器扩展';
    case 'web_app':
      return 'Web App';
    case 'service':
      return '服务';
    default:
      return type || '应用';
  }
}

export function getAppStatusLabel(status: string | null | undefined) {
  switch (status) {
    case 'active':
      return '已上架';
    case 'inactive':
      return '已下架';
    case 'cancelled':
      return '已取消';
    case 'expired':
      return '已过期';
    default:
      return status || '未设置';
  }
}

export function getActiveOffers<T extends { status: string }>(offers: T[]) {
  return offers.filter((offer) => offer.status === 'active');
}

export function getPreferredOffer<T extends { isDefault?: boolean; priceAmount: number; status: string }>(
  offers: T[],
) {
  const activeOffers = getActiveOffers(offers);
  if (!activeOffers.length) {
    return null;
  }
  return (
    activeOffers.find((offer) => offer.isDefault) ??
    activeOffers.reduce((current, next) =>
      next.priceAmount < current.priceAmount ? next : current,
    )
  );
}

export function formatOfferPriceLabel(offer: OfferLike | null | undefined) {
  if (!offer) {
    return '即将开放';
  }
  return formatOfferPriceAmount(offer.priceAmount, offer.currency);
}

export function formatOfferStartingPriceLabel<T extends { priceAmount: number; currency: string; status: string }>(
  offers: T[],
) {
  const activeOffers = getActiveOffers(offers);
  if (!activeOffers.length) {
    return '即将开放';
  }

  const sorted = [...activeOffers].sort((left, right) => left.priceAmount - right.priceAmount);
  const minOffer = sorted[0];
  const maxOffer = sorted[sorted.length - 1];

  if (minOffer.priceAmount === maxOffer.priceAmount) {
    return formatOfferPriceAmount(minOffer.priceAmount, minOffer.currency);
  }

  return `${formatOfferPriceAmount(minOffer.priceAmount, minOffer.currency)} 起`;
}

export function formatOfferRangeLabel<T extends { priceAmount: number; currency: string; status: string }>(
  offers: T[],
) {
  const activeOffers = getActiveOffers(offers);
  if (!activeOffers.length) {
    return '即将开放';
  }

  const sorted = [...activeOffers].sort((left, right) => left.priceAmount - right.priceAmount);
  const minOffer = sorted[0];
  const maxOffer = sorted[sorted.length - 1];

  if (minOffer.priceAmount === maxOffer.priceAmount) {
    return formatOfferPriceAmount(minOffer.priceAmount, minOffer.currency);
  }

  return `${formatOfferPriceAmount(minOffer.priceAmount, minOffer.currency)} - ${formatOfferPriceAmount(maxOffer.priceAmount, maxOffer.currency)}`;
}

export function formatOfferCycleLabel(offer: OfferLike | null | undefined) {
  if (!offer) {
    return '当前暂无可购买方案';
  }
  if (offer.interval === 'month') {
    return '按月订阅';
  }
  if (offer.interval === 'year') {
    return '按年订阅';
  }
  if (offer.interval === 'one_time') {
    return '一次性付费';
  }
  return offer.interval || '当前暂无可购买方案';
}

export function getLinkTypeLabel(type: AppLink['type']) {
  switch (type) {
    case 'docs':
      return '文档';
    case 'support':
      return '支持';
    case 'website':
      return '官网';
    case 'download':
      return '下载';
    default:
      return '链接';
  }
}

export function getLinksByType(
  links: AppLink[] | null | undefined,
  type: AppLink['type'],
) {
  return (links ?? []).filter((link) => link.type === type && link.url.trim());
}

export function getAccessLinks(links: AppLink[] | null | undefined) {
  return [
    ...getLinksByType(links, 'website'),
    ...getLinksByType(links, 'download'),
  ];
}

export function getPrimaryWebsiteLink(links: AppLink[] | null | undefined) {
  return getLinksByType(links, 'website')[0] ?? null;
}

export function getPrimaryDownloadLink(links: AppLink[] | null | undefined) {
  return getLinksByType(links, 'download')[0] ?? null;
}

export function getAccessLinkLabel(link: Pick<AppLink, 'label' | 'type'>) {
  const label = link.label.trim();
  if (label) {
    return label;
  }

  if (link.type === 'website') {
    return '在线使用';
  }

  if (link.type === 'download') {
    return '下载应用';
  }

  return '访问链接';
}
