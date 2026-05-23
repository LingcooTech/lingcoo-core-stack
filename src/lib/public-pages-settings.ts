import { eq } from 'drizzle-orm';

import { systemSettings } from '../db/schema';
import type { DbClient } from '../db/types';
import type { AppEnv } from './env';

export type PublicPagesSettingsSource = 'database' | 'none';

export type HubPageContent = {
  eyebrow: string;
  title: string;
  description: string;
};

export type PublicPagesSettings = {
  contentHub: HubPageContent;
  docsHub: HubPageContent;
};

export type PublicPagesSettingsOverview = {
  configured: boolean;
  source: PublicPagesSettingsSource;
  values: PublicPagesSettings;
};

const PUBLIC_PAGES_SETTINGS_KEY = 'system.public-pages';

const DEFAULTS: PublicPagesSettings = {
  contentHub: {
    eyebrow: '内容中心',
    title: '文章、观点与教程',
    description: '汇集产品动态、观点文章、操作教程与最佳实践，帮助你更好地理解和使用平台。',
  },
  docsHub: {
    eyebrow: '文档中心',
    title: '产品文档与开发指南',
    description: '统一汇集 fd-core-stack 本身以及各应用的产品文档、接入说明、安装指南与常见问题。',
  },
};

function normalizeString(value: unknown, max: number, fallback: string) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return fallback;
  return trimmed.slice(0, max);
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeHub(value: unknown, defaults: HubPageContent): HubPageContent {
  const raw = normalizeObject(value);
  return {
    eyebrow: normalizeString(raw.eyebrow, 60, defaults.eyebrow),
    title: normalizeString(raw.title, 120, defaults.title),
    description: normalizeString(raw.description, 500, defaults.description),
  };
}

function isSame(left: PublicPagesSettings, right: PublicPagesSettings) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class PublicPagesSettingsService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv,
  ) {}

  private getDefaults(): PublicPagesSettings {
    return {
      contentHub: { ...DEFAULTS.contentHub },
      docsHub: { ...DEFAULTS.docsHub },
    };
  }

  private async findSettingRow() {
    const [row] = await this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, PUBLIC_PAGES_SETTINGS_KEY))
      .limit(1);

    return row ?? null;
  }

  private normalize(value: unknown): PublicPagesSettings {
    const raw = normalizeObject(value);
    return {
      contentHub: normalizeHub(raw.contentHub, DEFAULTS.contentHub),
      docsHub: normalizeHub(raw.docsHub, DEFAULTS.docsHub),
    };
  }

  async getDatabaseSettings(): Promise<PublicPagesSettings | null> {
    const row = await this.findSettingRow();
    return row ? this.normalize(row.value) : null;
  }

  async getPublicSettings(): Promise<PublicPagesSettings> {
    return (await this.getDatabaseSettings()) ?? this.getDefaults();
  }

  async getOverview(): Promise<PublicPagesSettingsOverview> {
    const defaults = this.getDefaults();
    const databaseSettings = await this.getDatabaseSettings();
    const values = databaseSettings ?? defaults;

    return {
      configured: databaseSettings ? !isSame(databaseSettings, defaults) : false,
      source: databaseSettings ? 'database' : 'none',
      values,
    };
  }

  async upsertSettings(
    input: {
      contentHub?: Partial<HubPageContent>;
      docsHub?: Partial<HubPageContent>;
    },
    updatedByUserId: string,
  ) {
    const next = this.normalize(input);
    const now = new Date();

    await this.db
      .insert(systemSettings)
      .values({
        key: PUBLIC_PAGES_SETTINGS_KEY,
        value: next,
        isEncrypted: false,
        updatedByUserId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: next,
          isEncrypted: false,
          updatedByUserId,
          updatedAt: now,
        },
      });

    return this.getOverview();
  }

  async clearSettings() {
    await this.db.delete(systemSettings).where(eq(systemSettings.key, PUBLIC_PAGES_SETTINGS_KEY));
  }
}
