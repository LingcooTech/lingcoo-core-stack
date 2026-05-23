import type { HubPageContent, PublicSiteSettings, SiteNavigationItem } from '@/api/types';

export const PUBLIC_SITE_SETTINGS_QUERY_KEY = ['public-site-settings'] as const;
export const DEFAULT_FAVICON_HREF = '/favicon.svg';
export const DEFAULT_HEADER_NAVIGATION: SiteNavigationItem[] = [
  { label: '应用中心', url: '/', openInNewTab: false, children: [] },
];

export const DEFAULT_CONTENT_HUB: HubPageContent = {
  eyebrow: '内容中心',
  title: '文章、观点与教程',
  description: '汇集产品动态、观点文章、操作教程与最佳实践，帮助你更好地理解和使用平台。',
};

export const DEFAULT_DOCS_HUB: HubPageContent = {
  eyebrow: '文档中心',
  title: '产品文档与开发指南',
  description: '统一汇集 fd-core-stack 本身以及各应用的产品文档、接入说明、安装指南与常见问题。',
};

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

/**
 * 把 `#rrggbb` 转成 Tailwind v4 / shadcn 期望的 HSL 三元组字符串（"H S% L%"），
 * 失败时返回 null。
 */
function hexToHslString(hex: string): string | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const intVal = Number.parseInt(match[1], 16);
  const r = ((intVal >> 16) & 0xff) / 255;
  const g = ((intVal >> 8) & 0xff) / 255;
  const b = (intVal & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / delta + 2) * 60;
        break;
      default:
        h = ((r - g) / delta + 4) * 60;
        break;
    }
  }
  return `${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`;
}

const BRAND_PRIMARY_VAR = '--primary';

export function syncBrandPrimaryColor(hex?: string | null) {
  const root = document.documentElement;
  const hsl = hex ? hexToHslString(hex) : null;
  if (hsl) {
    root.style.setProperty(BRAND_PRIMARY_VAR, hsl);
  } else {
    root.style.removeProperty(BRAND_PRIMARY_VAR);
  }
}

export function getSiteDisplayName(settings?: Pick<PublicSiteSettings, 'siteName'> | null) {
  return settings?.siteName?.trim() || 'FD Stack';
}

export function getSiteHeaderNavigation(
  settings?: Pick<PublicSiteSettings, 'headerNavigation'> | null,
) {
  return settings?.headerNavigation?.length ? settings.headerNavigation : DEFAULT_HEADER_NAVIGATION;
}

function pickHubField(value: string | undefined | null, fallback: string) {
  return value?.trim() || fallback;
}

export function getContentHubContent(
  settings?: Pick<PublicSiteSettings, 'publicPages'> | null,
): HubPageContent {
  const raw = settings?.publicPages?.contentHub;
  return {
    eyebrow: pickHubField(raw?.eyebrow, DEFAULT_CONTENT_HUB.eyebrow),
    title: pickHubField(raw?.title, DEFAULT_CONTENT_HUB.title),
    description: pickHubField(raw?.description, DEFAULT_CONTENT_HUB.description),
  };
}

export function getDocsHubContent(
  settings?: Pick<PublicSiteSettings, 'publicPages'> | null,
): HubPageContent {
  const raw = settings?.publicPages?.docsHub;
  return {
    eyebrow: pickHubField(raw?.eyebrow, DEFAULT_DOCS_HUB.eyebrow),
    title: pickHubField(raw?.title, DEFAULT_DOCS_HUB.title),
    description: pickHubField(raw?.description, DEFAULT_DOCS_HUB.description),
  };
}
