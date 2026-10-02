import { eq } from 'drizzle-orm';

import { systemSettings } from '../../../db/schema';
import type { DbExecutor } from '../../../db/types';
import type { AppEnv } from '../../../lib/env';
import { decryptJson, encryptJson, getEncryptionKeys } from '../../../lib/settings-crypto';

export type AlertLevel = 'info' | 'warning' | 'error';
export type AlertingSettingsSource = 'database' | 'env' | 'none';

export interface AlertingSettings {
  enabled: boolean;
  minimumLevel: AlertLevel;
  cooldownMinutes: number;
  email: {
    enabled: boolean;
    recipients: string[];
  };
  webhook: {
    enabled: boolean;
    url?: string;
    secret?: string;
  };
}

export interface AlertingSettingsOverview {
  configured: boolean;
  source: AlertingSettingsSource;
  values: {
    enabled: boolean;
    minimumLevel: AlertLevel;
    cooldownMinutes: number;
    email: {
      enabled: boolean;
      recipients: string[];
    };
    webhook: {
      enabled: boolean;
      url: string;
    };
  };
  secrets: {
    webhookSecret: {
      configured: boolean;
    };
  };
}

const ALERTING_SETTING_KEY = 'system.alerting.default';
const alertLevels: AlertLevel[] = ['info', 'warning', 'error'];

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

function normalizeInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value.trim(), 10)
        : Number.NaN;

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeLevel(value: unknown): AlertLevel {
  const normalized = normalizeString(value) as AlertLevel;
  return alertLevels.includes(normalized) ? normalized : 'warning';
}

function normalizeRecipients(value: unknown) {
  const rawItems = Array.isArray(value)
    ? value
    : normalizeString(value)
        .split(/[,\n;]/)
        .map((item) => item.trim());

  return [
    ...new Set(
      rawItems
        .map(normalizeString)
        .filter(Boolean)
        .map((item) => item.toLowerCase()),
    ),
  ];
}

function hasSecret(value: string | undefined) {
  return Boolean(value?.trim());
}

export class AlertingSettingsService {
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
      .where(eq(systemSettings.key, ALERTING_SETTING_KEY))
      .limit(1);

    return row ?? null;
  }

  private decodeSetting<T>(
    row: NonNullable<Awaited<ReturnType<AlertingSettingsService['findSettingRow']>>>,
  ) {
    if (row.isEncrypted) {
      return decryptJson<T>(row.value, this.getEncryptionSecret());
    }

    return row.value as T;
  }

  private normalizeSettings(value: unknown): AlertingSettings | null {
    const raw = normalizeObject(value);
    const email = normalizeObject(raw.email);
    const webhook = normalizeObject(raw.webhook);
    const recipients = normalizeRecipients(email.recipients ?? raw.emailRecipients);
    const webhookUrl = normalizeString(webhook.url ?? raw.webhookUrl);
    const webhookSecret = normalizeString(webhook.secret ?? raw.webhookSecret);
    const emailEnabled = normalizeBoolean(email.enabled ?? raw.emailEnabled, recipients.length > 0);
    const webhookEnabled = normalizeBoolean(
      webhook.enabled ?? raw.webhookEnabled,
      Boolean(webhookUrl),
    );
    const enabled = normalizeBoolean(raw.enabled, emailEnabled || webhookEnabled);

    if (!enabled && recipients.length === 0 && !webhookUrl) {
      return null;
    }

    return {
      enabled,
      minimumLevel: normalizeLevel(raw.minimumLevel),
      cooldownMinutes: normalizeInteger(raw.cooldownMinutes, 60, 5, 24 * 60),
      email: {
        enabled: emailEnabled,
        recipients,
      },
      webhook: {
        enabled: webhookEnabled,
        url: webhookUrl || undefined,
        secret: webhookSecret || undefined,
      },
    };
  }

  async getDatabaseSettings() {
    const row = await this.findSettingRow();
    return row ? this.normalizeSettings(this.decodeSetting<unknown>(row)) : null;
  }

  getEnvSettings(): AlertingSettings | null {
    const recipients = normalizeRecipients(this.env.ALERT_EMAIL_RECIPIENTS);
    const webhookUrl = normalizeString(this.env.ALERT_WEBHOOK_URL);
    const webhookSecret = normalizeString(this.env.ALERT_WEBHOOK_SECRET);
    const emailEnabled = normalizeBoolean(this.env.ALERT_EMAIL_ENABLED, recipients.length > 0);
    const webhookEnabled = normalizeBoolean(this.env.ALERT_WEBHOOK_ENABLED, Boolean(webhookUrl));
    const enabled = normalizeBoolean(this.env.ALERTING_ENABLED, emailEnabled || webhookEnabled);

    if (!enabled && recipients.length === 0 && !webhookUrl) {
      return null;
    }

    return {
      enabled,
      minimumLevel: normalizeLevel(this.env.ALERT_MIN_LEVEL),
      cooldownMinutes: normalizeInteger(this.env.ALERT_COOLDOWN_MINUTES, 60, 5, 24 * 60),
      email: {
        enabled: emailEnabled,
        recipients,
      },
      webhook: {
        enabled: webhookEnabled,
        url: webhookUrl || undefined,
        secret: webhookSecret || undefined,
      },
    };
  }

  async getRuntimeSettings(): Promise<AlertingSettings | null> {
    return (await this.getDatabaseSettings()) ?? this.getEnvSettings();
  }

  async getOverview(): Promise<AlertingSettingsOverview> {
    const databaseSettings = await this.getDatabaseSettings();
    const envSettings = this.getEnvSettings();
    const effective = databaseSettings ?? envSettings;
    const source: AlertingSettingsSource = databaseSettings
      ? 'database'
      : envSettings
        ? 'env'
        : 'none';

    return {
      configured: Boolean(
        effective?.enabled &&
        ((effective.email.enabled && effective.email.recipients.length > 0) ||
          (effective.webhook.enabled && effective.webhook.url)),
      ),
      source,
      values: {
        enabled: effective?.enabled ?? false,
        minimumLevel: effective?.minimumLevel ?? 'warning',
        cooldownMinutes: effective?.cooldownMinutes ?? 60,
        email: {
          enabled: effective?.email.enabled ?? false,
          recipients: effective?.email.recipients ?? [],
        },
        webhook: {
          enabled: effective?.webhook.enabled ?? false,
          url: effective?.webhook.url ?? '',
        },
      },
      secrets: {
        webhookSecret: {
          configured: hasSecret(effective?.webhook.secret),
        },
      },
    };
  }

  async upsertSettings(
    input: {
      enabled?: boolean;
      minimumLevel?: AlertLevel;
      cooldownMinutes?: number;
      email?: {
        enabled?: boolean;
        recipients?: string[];
      };
      webhook?: {
        enabled?: boolean;
        url?: string;
        secret?: string;
      };
    },
    updatedByUserId: string,
  ) {
    const existing = (await this.getDatabaseSettings()) ?? this.getEnvSettings();
    const next: AlertingSettings = {
      enabled: input.enabled ?? existing?.enabled ?? false,
      minimumLevel: normalizeLevel(input.minimumLevel ?? existing?.minimumLevel),
      cooldownMinutes: normalizeInteger(
        input.cooldownMinutes,
        existing?.cooldownMinutes ?? 60,
        5,
        24 * 60,
      ),
      email: {
        enabled: input.email?.enabled ?? existing?.email.enabled ?? false,
        recipients: normalizeRecipients(
          input.email?.recipients ?? existing?.email.recipients ?? [],
        ),
      },
      webhook: {
        enabled: input.webhook?.enabled ?? existing?.webhook.enabled ?? false,
        url: normalizeString(input.webhook?.url) || existing?.webhook.url || undefined,
        secret: normalizeString(input.webhook?.secret) || existing?.webhook.secret || undefined,
      },
    };

    const now = new Date();
    await this.db
      .insert(systemSettings)
      .values({
        key: ALERTING_SETTING_KEY,
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
    await this.db.delete(systemSettings).where(eq(systemSettings.key, ALERTING_SETTING_KEY));
  }
}
