import { eq } from 'drizzle-orm';

import { systemSettings } from '../db/schema';
import type { DbClient } from '../db/types';
import type { AppEnv } from './env';

export type SiteSettingsSource = 'database' | 'none';

export type SiteFooterLink = {
  label: string;
  url: string;
  openInNewTab: boolean;
};

export type SiteNavigationChild = SiteFooterLink;

export type SiteNavigationItem = {
  label: string;
  url: string;
  openInNewTab: boolean;
  children: SiteNavigationChild[];
};

export type SiteSettings = {
  siteName: string;
  logoUrl: string;
  faviconUrl: string;
  headerNavigation: SiteNavigationItem[];
  footerCopyright: string;
  filingInfo: string;
  footerLinks: SiteFooterLink[];
};

export type SiteSettingsOverview = {
  configured: boolean;
  source: SiteSettingsSource;
  values: SiteSettings;
};

const SITE_SETTINGS_KEY = 'system.site.presentation';
const DEFAULT_SITE_NAME = 'FD Stack';
const DEFAULT_COPYRIGHT = '© {year} FutureDecade. All rights reserved.';
const DEFAULT_HEADER_NAVIGATION: SiteNavigationItem[] = [
  { label: '应用中心', url: '/', openInNewTab: false, children: [] }
];
const DEFAULT_FOOTER_LINKS: SiteFooterLink[] = [
  { label: '应用中心', url: '/', openInNewTab: false },
  { label: '我的订单', url: '/orders', openInNewTab: false },
  { label: '我的应用', url: '/access', openInNewTab: false },
  { label: '隐私政策', url: '/apps/ai-translate-workflow/privacy', openInNewTab: false },
  { label: '支持页', url: '/apps/ai-translate-workflow/support', openInNewTab: false }
];

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function isAllowedSiteUrl(value: string) {
  if (!value) {
    return false;
  }

  if (value.startsWith('/')) {
    return true;
  }

  try {
    const url = new URL(value);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function normalizeSiteUrl(value: unknown) {
  const raw = normalizeString(value);
  return isAllowedSiteUrl(raw) ? raw : '';
}

function normalizeFooterLinks(value: unknown): SiteFooterLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const raw = normalizeObject(item);
      const label = normalizeString(raw.label).slice(0, 60);
      const url = normalizeSiteUrl(raw.url);

      if (!label || !url) {
        return null;
      }

      return {
        label,
        url,
        openInNewTab: normalizeBoolean(raw.openInNewTab)
      } satisfies SiteFooterLink;
    })
    .filter((item): item is SiteFooterLink => Boolean(item))
    .slice(0, 12);
}

function cloneFooterLinks(links: SiteFooterLink[]) {
  return links.map((item) => ({ ...item }));
}

function cloneHeaderNavigation(items: SiteNavigationItem[]) {
  return items.map((item) => ({
    ...item,
    children: cloneFooterLinks(item.children)
  }));
}

function normalizeHeaderNavigation(value: unknown): SiteNavigationItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const raw = normalizeObject(item);
      const label = normalizeString(raw.label).slice(0, 60);
      const url = normalizeSiteUrl(raw.url);
      const children = normalizeFooterLinks(raw.children);

      if (!label) {
        return null;
      }

      if (!url && children.length === 0) {
        return null;
      }

      return {
        label,
        url,
        openInNewTab: normalizeBoolean(raw.openInNewTab),
        children
      } satisfies SiteNavigationItem;
    })
    .filter((item): item is SiteNavigationItem => Boolean(item))
    .slice(0, 12);
}

function buildDefaultSiteSettings(env: AppEnv): SiteSettings {
  const envSiteName = normalizeString(env.APP_NAME);

  return {
    siteName: envSiteName && envSiteName !== 'fd-core-stack' ? envSiteName : DEFAULT_SITE_NAME,
    logoUrl: '',
    faviconUrl: '',
    headerNavigation: cloneHeaderNavigation(DEFAULT_HEADER_NAVIGATION),
    footerCopyright: DEFAULT_COPYRIGHT,
    filingInfo: '',
    footerLinks: cloneFooterLinks(DEFAULT_FOOTER_LINKS)
  };
}

function isSameSiteSettings(left: SiteSettings, right: SiteSettings) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class SiteSettingsService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv
  ) {}

  private getDefaults() {
    return buildDefaultSiteSettings(this.env);
  }

  private async findSettingRow() {
    const [row] = await this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, SITE_SETTINGS_KEY))
      .limit(1);

    return row ?? null;
  }

  private normalizeSettings(value: unknown): SiteSettings {
    const defaults = this.getDefaults();
    const raw = normalizeObject(value);
    const headerNavigation = normalizeHeaderNavigation(raw.headerNavigation);
    const footerLinks = normalizeFooterLinks(raw.footerLinks);

    return {
      siteName: normalizeString(raw.siteName).slice(0, 120) || defaults.siteName,
      logoUrl: normalizeSiteUrl(raw.logoUrl),
      faviconUrl: normalizeSiteUrl(raw.faviconUrl),
      headerNavigation: headerNavigation.length ? cloneHeaderNavigation(headerNavigation) : cloneHeaderNavigation(defaults.headerNavigation),
      footerCopyright: normalizeString(raw.footerCopyright).slice(0, 255) || defaults.footerCopyright,
      filingInfo: normalizeString(raw.filingInfo).slice(0, 255),
      footerLinks: cloneFooterLinks(footerLinks)
    };
  }

  async getDatabaseSettings() {
    const row = await this.findSettingRow();
    return row ? this.normalizeSettings(row.value) : null;
  }

  async getPublicSettings(): Promise<SiteSettings> {
    return (await this.getDatabaseSettings()) ?? this.getDefaults();
  }

  async getOverview(): Promise<SiteSettingsOverview> {
    const defaults = this.getDefaults();
    const databaseSettings = await this.getDatabaseSettings();
    const values = databaseSettings ?? defaults;

    return {
      configured: databaseSettings ? !isSameSiteSettings(databaseSettings, defaults) : false,
      source: databaseSettings ? 'database' : 'none',
      values
    };
  }

  async upsertSettings(
    input: {
      siteName?: string;
      logoUrl?: string;
      faviconUrl?: string;
      headerNavigation?: Array<{
        label: string;
        url?: string;
        openInNewTab?: boolean;
        children?: Array<{
          label: string;
          url: string;
          openInNewTab?: boolean;
        }>;
      }>;
      footerCopyright?: string;
      filingInfo?: string;
      footerLinks?: Array<{
        label: string;
        url: string;
        openInNewTab?: boolean;
      }>;
    },
    updatedByUserId: string
  ) {
    const next = this.normalizeSettings(input);
    const now = new Date();

    await this.db
      .insert(systemSettings)
      .values({
        key: SITE_SETTINGS_KEY,
        value: next,
        isEncrypted: false,
        updatedByUserId,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: next,
          isEncrypted: false,
          updatedByUserId,
          updatedAt: now
        }
      });

    return this.getOverview();
  }

  async clearSettings() {
    await this.db.delete(systemSettings).where(eq(systemSettings.key, SITE_SETTINGS_KEY));
  }
}
