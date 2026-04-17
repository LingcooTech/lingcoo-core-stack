import type { PublicSiteSettings } from '@/api/types';

export const PUBLIC_SITE_SETTINGS_QUERY_KEY = ['public-site-settings'] as const;
export const DEFAULT_FAVICON_HREF = '/favicon.svg';

export function isExternalSiteUrl(url: string) {
  return /^(https?:|mailto:|tel:)/i.test(url);
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
