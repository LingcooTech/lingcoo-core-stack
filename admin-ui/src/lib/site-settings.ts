import type { PublicSiteSettings, SiteNavigationItem } from '@/api/types';

export const PUBLIC_SITE_SETTINGS_QUERY_KEY = ['public-site-settings'] as const;
export const DEFAULT_FAVICON_HREF = '/favicon.svg';
export const DEFAULT_HEADER_NAVIGATION: SiteNavigationItem[] = [
  { label: '应用中心', url: '/', openInNewTab: false, children: [] },
  { label: '订单记录', url: '/orders', openInNewTab: false, children: [] },
  { label: '我的应用', url: '/access', openInNewTab: false, children: [] }
];

export function isExternalSiteUrl(url: string) {
  return /^(https?:|mailto:|tel:)/i.test(url);
}

export function isInternalSiteUrl(url: string) {
  return url.startsWith('/');
}

export function getNormalizedInternalPath(url: string) {
  return url.split('?')[0]?.split('#')[0] ?? url;
}

export function resolveFooterCopyright(value: string) {
  return value.replace(/\{year\}/g, String(new Date().getFullYear()));
}

export function syncDocumentFavicon(faviconUrl?: string | null) {
  const href = faviconUrl?.trim() || DEFAULT_FAVICON_HREF;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');

  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }

  link.href = href;
}

export function getSiteDisplayName(settings?: Pick<PublicSiteSettings, 'siteName'> | null) {
  return settings?.siteName?.trim() || 'FD Stack';
}

export function getSiteHeaderNavigation(settings?: Pick<PublicSiteSettings, 'headerNavigation'> | null) {
  return settings?.headerNavigation?.length ? settings.headerNavigation : DEFAULT_HEADER_NAVIGATION;
}
