import { eq } from 'drizzle-orm';

import { systemSettings } from '../db/schema';
import type { DbClient } from '../db/types';
import type { AppEnv } from './env';
import { httpError } from './errors';
import { Mailer } from './mailer';
import { decryptJson, encryptJson } from './settings-crypto';

export type SmtpSettingsSource = 'database' | 'env' | 'none';

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
  from: string;
};

export type SmtpSettingsOverview = {
  configured: boolean;
  source: SmtpSettingsSource;
  values: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from: string;
  };
  secrets: {
    password: {
      configured: boolean;
    };
  };
};

const SMTP_SETTING_KEY = 'system.smtp.default';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBoolean(value: unknown, defaultValue = false) {
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

  return defaultValue;
}

function normalizePort(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
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

function hasSecret(value: string | undefined) {
  return Boolean(value?.trim());
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export class SmtpSettingsService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv
  ) {}

  private getEncryptionSecret() {
    return normalizeString(this.env.SETTINGS_ENCRYPTION_KEY) || this.env.JWT_SECRET;
  }

  private getDefaultFrom() {
    const appName = normalizeString(this.env.APP_NAME) || 'fd-core-stack.local';
    return normalizeString(this.env.SMTP_FROM) || `noreply@${appName}`;
  }

  private async findSettingRow() {
    const [row] = await this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, SMTP_SETTING_KEY))
      .limit(1);

    return row ?? null;
  }

  private decodeSetting<T>(row: NonNullable<Awaited<ReturnType<SmtpSettingsService['findSettingRow']>>>) {
    if (row.isEncrypted) {
      return decryptJson<T>(row.value, this.getEncryptionSecret());
    }

    return row.value as T;
  }

  private normalizeSettings(value: unknown): SmtpSettings | null {
    const raw = normalizeObject(value);
    const host = normalizeString(raw.host);
    const port = normalizePort(raw.port, 465);
    const secure = normalizeBoolean(raw.secure, port === 465);
    const user = normalizeString(raw.user);
    const password = normalizeString(raw.password);
    const from = normalizeString(raw.from) || this.getDefaultFrom();

    if (!host && !user && !password) {
      return null;
    }

    return {
      host,
      port,
      secure,
      user,
      password,
      from
    };
  }

  async getDatabaseSettings() {
    const row = await this.findSettingRow();
    return row ? this.normalizeSettings(this.decodeSetting<unknown>(row)) : null;
  }

  getEnvSettings(): SmtpSettings | null {
    const host = normalizeString(this.env.SMTP_HOST);
    const port = normalizePort(this.env.SMTP_PORT, 465);
    const secure = port === 465;
    const user = normalizeString(this.env.SMTP_USER);
    const password = normalizeString(this.env.SMTP_PASSWORD);
    const from = this.getDefaultFrom();

    if (!host && !user && !password) {
      return null;
    }

    return {
      host,
      port,
      secure,
      user,
      password,
      from
    };
  }

  async getRuntimeSettings(): Promise<SmtpSettings | null> {
    return (await this.getDatabaseSettings()) ?? this.getEnvSettings();
  }

  async resolveDraftSettings(
    input: {
      host?: string;
      port?: number;
      secure?: boolean;
      user?: string;
      password?: string;
      from?: string;
    } = {}
  ): Promise<SmtpSettings> {
    const existing = (await this.getDatabaseSettings()) ?? this.getEnvSettings();

    return {
      host: normalizeString(input.host) || existing?.host || '',
      port: normalizePort(input.port, existing?.port ?? 465),
      secure:
        typeof input.secure === 'boolean'
          ? input.secure
          : existing?.secure ?? normalizePort(input.port, 465) === 465,
      user: normalizeString(input.user) || existing?.user || '',
      password: normalizeString(input.password) || existing?.password || '',
      from: normalizeString(input.from) || existing?.from || this.getDefaultFrom()
    };
  }

  async getOverview(): Promise<SmtpSettingsOverview> {
    const databaseSettings = await this.getDatabaseSettings();
    const envSettings = this.getEnvSettings();
    const effective = databaseSettings ?? envSettings;
    const source: SmtpSettingsSource = databaseSettings ? 'database' : envSettings ? 'env' : 'none';

    return {
      configured: Boolean(effective?.host && effective.user && effective.password),
      source,
      values: {
        host: effective?.host ?? '',
        port: effective?.port ?? 465,
        secure: effective?.secure ?? true,
        user: effective?.user ?? '',
        from: effective?.from ?? this.getDefaultFrom()
      },
      secrets: {
        password: {
          configured: hasSecret(effective?.password)
        }
      }
    };
  }

  async upsertSettings(
    input: {
      host?: string;
      port?: number;
      secure?: boolean;
      user?: string;
      password?: string;
      from?: string;
    },
    updatedByUserId: string
  ) {
    const next = await this.resolveDraftSettings(input);

    const now = new Date();

    await this.db
      .insert(systemSettings)
      .values({
        key: SMTP_SETTING_KEY,
        value: encryptJson(next, this.getEncryptionSecret()),
        isEncrypted: true,
        updatedByUserId,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: encryptJson(next, this.getEncryptionSecret()),
          isEncrypted: true,
          updatedByUserId,
          updatedAt: now
        }
      });

    return this.getOverview();
  }

  async sendTestEmail(input: {
    to: string;
    subject: string;
    text: string;
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    password?: string;
    from?: string;
  }) {
    const to = normalizeString(input.to);
    const subject = normalizeString(input.subject);
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    const draft = await this.resolveDraftSettings(input);
    const mailer = new Mailer(
      draft.host && draft.user && draft.password
        ? {
            host: draft.host,
            port: draft.port,
            secure: draft.secure,
            user: draft.user,
            password: draft.password,
            from: draft.from
          }
        : null
    );

    if (!mailer.isConfigured) {
      throw httpError(422, 'SMTP 配置不完整，无法发送测试邮件');
    }

    await mailer.send({
      to,
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.7;white-space:pre-wrap;">${escapeHtml(text)}</div>`
    });

    return {
      sent: true,
      to,
      from: draft.from,
      subject
    };
  }

  async clearSettings() {
    await this.db.delete(systemSettings).where(eq(systemSettings.key, SMTP_SETTING_KEY));
  }
}
