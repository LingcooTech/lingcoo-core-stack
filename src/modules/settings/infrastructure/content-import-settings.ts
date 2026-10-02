import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { systemSettings } from '../../../db/schema';
import type { DbExecutor } from '../../../db/types';
import type { AppEnv } from '../../../lib/env';
import { httpError } from '../../../lib/errors';
import { decryptJson, encryptJson, getEncryptionKeys } from '../../../lib/settings-crypto';

export type ContentImportSettingsSource = 'database' | 'none';

export type WordPressImportSettings = {
  siteUrl: string;
  username: string;
  appPassword?: string;
};

export type NotionImportSettings = {
  apiToken?: string;
};

export type ContentImportSettings = {
  wordpress: WordPressImportSettings;
  notion: NotionImportSettings;
};

export type ContentImportSettingsOverview = {
  configured: boolean;
  source: ContentImportSettingsSource;
  values: {
    wordpress: {
      siteUrl: string;
      username: string;
    };
    notion: Record<string, never>;
  };
  secrets: {
    wordpress: {
      appPassword: {
        configured: boolean;
      };
    };
    notion: {
      apiToken: {
        configured: boolean;
      };
    };
  };
};

const CONTENT_IMPORT_SETTINGS_KEY = 'system.content.import';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeUrl(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) {
    return '';
  }

  try {
    return new URL(raw).toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function hasSecret(value: string | undefined) {
  return Boolean(value?.trim());
}

export class ContentImportSettingsService {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
  ) {}

  private getEncryptionSecret() {
    return getEncryptionKeys(this.env);
  }

  private async findSettingRow() {
    const [row] = await this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, CONTENT_IMPORT_SETTINGS_KEY))
      .limit(1);

    return row ?? null;
  }

  private decodeSetting<T>(
    row: NonNullable<Awaited<ReturnType<ContentImportSettingsService['findSettingRow']>>>,
  ) {
    if (row.isEncrypted) {
      return decryptJson<T>(row.value, this.getEncryptionSecret());
    }

    return row.value as T;
  }

  private normalizeSettings(value: unknown): ContentImportSettings | null {
    const raw = normalizeObject(value);
    const wordpress = normalizeObject(raw.wordpress);
    const notion = normalizeObject(raw.notion);

    const normalized = {
      wordpress: {
        siteUrl: normalizeUrl(wordpress.siteUrl),
        username: normalizeString(wordpress.username).slice(0, 255),
        appPassword: normalizeString(wordpress.appPassword).slice(0, 255),
      },
      notion: {
        apiToken: normalizeString(notion.apiToken).slice(0, 255),
      },
    } satisfies ContentImportSettings;

    if (
      !normalized.wordpress.siteUrl &&
      !normalized.wordpress.username &&
      !normalized.wordpress.appPassword &&
      !normalized.notion.apiToken
    ) {
      return null;
    }

    return normalized;
  }

  async getDatabaseSettings() {
    const row = await this.findSettingRow();
    return row ? this.normalizeSettings(this.decodeSetting<unknown>(row)) : null;
  }

  async getRuntimeSettings(): Promise<ContentImportSettings | null> {
    return this.getDatabaseSettings();
  }

  async resolveDraftSettings(
    input: {
      wordpress?: {
        siteUrl?: string;
        username?: string;
        appPassword?: string;
      };
      notion?: {
        apiToken?: string;
      };
    } = {},
  ): Promise<ContentImportSettings> {
    const existing = await this.getRuntimeSettings();

    return {
      wordpress: {
        siteUrl: normalizeUrl(input.wordpress?.siteUrl) || existing?.wordpress.siteUrl || '',
        username: normalizeString(input.wordpress?.username) || existing?.wordpress.username || '',
        appPassword:
          normalizeString(input.wordpress?.appPassword) || existing?.wordpress.appPassword || '',
      },
      notion: {
        apiToken: normalizeString(input.notion?.apiToken) || existing?.notion.apiToken || '',
      },
    };
  }

  async getOverview(): Promise<ContentImportSettingsOverview> {
    const settings = await this.getRuntimeSettings();

    return {
      configured: Boolean(
        settings?.wordpress.siteUrl || settings?.wordpress.appPassword || settings?.notion.apiToken,
      ),
      source: settings ? 'database' : 'none',
      values: {
        wordpress: {
          siteUrl: settings?.wordpress.siteUrl ?? '',
          username: settings?.wordpress.username ?? '',
        },
        notion: {},
      },
      secrets: {
        wordpress: {
          appPassword: {
            configured: hasSecret(settings?.wordpress.appPassword),
          },
        },
        notion: {
          apiToken: {
            configured: hasSecret(settings?.notion.apiToken),
          },
        },
      },
    };
  }

  async upsertSettings(
    input: {
      wordpress?: {
        siteUrl?: string;
        username?: string;
        appPassword?: string;
      };
      notion?: {
        apiToken?: string;
      };
    },
    updatedByUserId: string,
  ) {
    const next = await this.resolveDraftSettings(input);
    const now = new Date();

    await this.db
      .insert(systemSettings)
      .values({
        key: CONTENT_IMPORT_SETTINGS_KEY,
        value: encryptJson(next, this.getEncryptionSecret()),
        isEncrypted: true,
        updatedByUserId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: encryptJson(next, this.getEncryptionSecret()),
          isEncrypted: true,
          updatedByUserId,
          updatedAt: now,
        },
      });

    return this.getOverview();
  }

  async clearSettings() {
    await this.db.delete(systemSettings).where(eq(systemSettings.key, CONTENT_IMPORT_SETTINGS_KEY));
  }

  private basicAuthHeader(username?: string, appPassword?: string) {
    const safeUsername = normalizeString(username);
    const safePassword = normalizeString(appPassword);
    if (!safeUsername || !safePassword) {
      return undefined;
    }

    return `Basic ${Buffer.from(`${safeUsername}:${safePassword}`).toString('base64')}`;
  }

  async testWordPressConnection(
    input: {
      siteUrl?: string;
      username?: string;
      appPassword?: string;
    } = {},
  ) {
    const settings = await this.resolveDraftSettings({ wordpress: input });

    if (!settings.wordpress.siteUrl) {
      throw httpError(422, 'WordPress 站点地址未配置');
    }

    const auth = this.basicAuthHeader(settings.wordpress.username, settings.wordpress.appPassword);
    const requestUrl = auth
      ? `${settings.wordpress.siteUrl}/wp-json/wp/v2/users/me`
      : `${settings.wordpress.siteUrl}/wp-json/wp/v2/posts?per_page=1&_fields=id`;

    const response = await fetch(requestUrl, {
      headers: auth ? { Authorization: auth } : undefined,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw httpError(502, `WordPress 连接失败 (${response.status})`);
    }

    const rawData: unknown = await response.json();
    const data = auth
      ? z.object({ name: z.string().optional(), slug: z.string().optional() }).parse(rawData)
      : undefined;
    const userName = auth ? normalizeString(data?.name || data?.slug) : '';

    return {
      ok: true,
      provider: 'wordpress' as const,
      siteUrl: settings.wordpress.siteUrl,
      mode: auth ? ('authenticated' as const) : ('public' as const),
      account: userName || null,
    };
  }

  async testNotionConnection(input: { apiToken?: string } = {}) {
    const settings = await this.resolveDraftSettings({ notion: input });

    if (!settings.notion.apiToken) {
      throw httpError(422, 'Notion API Token 未配置');
    }

    const response = await fetch('https://api.notion.com/v1/users/me', {
      headers: {
        Authorization: `Bearer ${settings.notion.apiToken}`,
        'Notion-Version': '2022-06-28',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw httpError(502, `Notion 连接失败 (${response.status})`);
    }

    const data = z
      .object({
        name: z.string().nullable().optional(),
        bot: z
          .object({ owner: z.object({ workspace_name: z.string().optional() }).optional() })
          .optional(),
      })
      .parse(await response.json());

    return {
      ok: true,
      provider: 'notion' as const,
      workspace: normalizeString(data?.bot?.owner?.workspace_name) || null,
      userName: normalizeString(data?.name) || null,
    };
  }
}
