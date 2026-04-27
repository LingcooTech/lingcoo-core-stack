import { eq } from 'drizzle-orm';

import { appDeliverySettings, systemSettings } from '../db/schema';
import type { DbClient } from '../db/types';
import { AppRepository } from '../modules/app/repository';
import { hasPublicTable } from './db-compat';
import {
  listDeliveryManifestAssetRequiredSecretKeys,
  listDeliveryManifestFields,
  normalizeDeliveryManifest,
  type DeliveryManifestField
} from './delivery-manifest';
import type { AppEnv } from './env';
import { httpError } from './errors';
import { decryptJson, encryptJson } from './settings-crypto';

type SecretStatus = {
  configured: boolean;
};

export type DeliverySettingValue = string | boolean;
export type DeliverySettingValues = Record<string, DeliverySettingValue>;
export type DeliverySettingSecrets = Record<string, string>;

export type DeliverySettingsOverview = {
  appCode: string;
  configured: boolean;
  values: DeliverySettingValues;
  secrets: Record<string, SecretStatus>;
};

export type DeliverySettingsInput = {
  values?: DeliverySettingValues;
  secrets?: DeliverySettingSecrets;
  installer?: {
    repoUrl?: string;
    repoBranch?: string;
  };
} & Record<string, unknown>;

export type StoredDeliverySettings = {
  values: DeliverySettingValues;
  secrets: DeliverySettingSecrets;
  installer: {
    repoUrl: string;
    repoBranch: string;
  };
};

const DEFAULT_INSTALLER = {
  repoUrl: 'https://github.com/FutureDecade/fd-headless-wp-system.git',
  repoBranch: 'main'
};

const LEGACY_VALUE_KEY_MAP: Record<
  string,
  { envKey: string; kind: 'string' | 'boolean' }
> = {
  frontendImage: { envKey: 'FRONTEND_IMAGE', kind: 'string' },
  websocketImage: { envKey: 'WEBSOCKET_IMAGE', kind: 'string' },
  letsencryptEmail: { envKey: 'LETSENCRYPT_EMAIL', kind: 'string' },
  acrUsername: { envKey: 'ACR_USERNAME', kind: 'string' },
  wordpressFetchReleaseAssets: { envKey: 'WORDPRESS_FETCH_RELEASE_ASSETS', kind: 'boolean' },
  wordpressRunInit: { envKey: 'WORDPRESS_RUN_INIT', kind: 'boolean' },
  wordpressReleaseOwner: { envKey: 'WORDPRESS_RELEASE_OWNER', kind: 'string' },
  fdThemeReleaseTag: { envKey: 'FD_THEME_RELEASE_TAG', kind: 'string' },
  fdPageComposerReleaseTag: { envKey: 'FD_PAGE_COMPOSER_RELEASE_TAG', kind: 'string' },
  fdAdminUiReleaseTag: { envKey: 'FD_ADMIN_UI_RELEASE_TAG', kind: 'string' },
  fdMemberReleaseTag: { envKey: 'FD_MEMBER_RELEASE_TAG', kind: 'string' },
  fdPaymentReleaseTag: { envKey: 'FD_PAYMENT_RELEASE_TAG', kind: 'string' },
  fdCommerceReleaseTag: { envKey: 'FD_COMMERCE_RELEASE_TAG', kind: 'string' },
  fdContentTypesReleaseTag: { envKey: 'FD_CONTENT_TYPES_RELEASE_TAG', kind: 'string' },
  fdFormsReleaseTag: { envKey: 'FD_FORMS_RELEASE_TAG', kind: 'string' },
  fdAiRouterReleaseTag: { envKey: 'FD_AI_ROUTER_RELEASE_TAG', kind: 'string' },
  fdWebsocketPushReleaseTag: { envKey: 'FD_WEBSOCKET_PUSH_RELEASE_TAG', kind: 'string' },
  wpgraphqlReleaseTag: { envKey: 'WPGRAPHQL_RELEASE_TAG', kind: 'string' },
  wpgraphqlJwtAuthReleaseTag: { envKey: 'WPGRAPHQL_JWT_AUTH_RELEASE_TAG', kind: 'string' },
  wpgraphqlTaxQueryRef: { envKey: 'WPGRAPHQL_TAX_QUERY_REF', kind: 'string' }
};

const LEGACY_SECRET_KEY_MAP: Record<string, string> = {
  acrPassword: 'ACR_PASSWORD',
  githubToken: 'GH_TOKEN'
};

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
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

  return undefined;
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeValueRecord(value: unknown) {
  const raw = normalizeObject(value);
  const result: DeliverySettingValues = {};

  for (const [key, entry] of Object.entries(raw)) {
    const stringValue = normalizeString(entry);
    const booleanValue = normalizeBoolean(entry);

    if (typeof entry === 'boolean') {
      result[key] = entry;
      continue;
    }

    if (typeof booleanValue === 'boolean' && typeof entry === 'string' && stringValue.length > 0) {
      result[key] = booleanValue;
      continue;
    }

    if (stringValue.length > 0) {
      result[key] = stringValue;
    }
  }

  return result;
}

function normalizeSecretRecord(value: unknown) {
  const raw = normalizeObject(value);
  const result: DeliverySettingSecrets = {};

  for (const [key, entry] of Object.entries(raw)) {
    const normalized = normalizeString(entry);
    if (normalized.length > 0) {
      result[key] = normalized;
    }
  }

  return result;
}

function createEmptyStoredSettings(): StoredDeliverySettings {
  return {
    values: {},
    secrets: {},
    installer: { ...DEFAULT_INSTALLER }
  };
}

function normalizeInstallerOverrides(value: unknown) {
  const raw = normalizeObject(value);

  return {
    repoUrl: normalizeString(raw.repoUrl) || DEFAULT_INSTALLER.repoUrl,
    repoBranch: normalizeString(raw.repoBranch) || DEFAULT_INSTALLER.repoBranch
  };
}

function normalizeLegacySettings(value: Record<string, unknown>): StoredDeliverySettings {
  const next = createEmptyStoredSettings();

  for (const [legacyKey, config] of Object.entries(LEGACY_VALUE_KEY_MAP)) {
    const entry = value[legacyKey];
    if (config.kind === 'boolean') {
      const normalized = normalizeBoolean(entry);
      if (typeof normalized === 'boolean') {
        next.values[config.envKey] = normalized;
      }
      continue;
    }

    const normalized = normalizeString(entry);
    if (normalized.length > 0) {
      next.values[config.envKey] = normalized;
    }
  }

  for (const [legacyKey, envKey] of Object.entries(LEGACY_SECRET_KEY_MAP)) {
    const normalized = normalizeString(value[legacyKey]);
    if (normalized.length > 0) {
      next.secrets[envKey] = normalized;
    }
  }

  const githubTokenAlias = normalizeString(value.GITHUB_TOKEN);
  if (githubTokenAlias.length > 0 && !next.secrets.GH_TOKEN) {
    next.secrets.GH_TOKEN = githubTokenAlias;
  }

  next.installer = {
    repoUrl: normalizeString(value.repoUrl) || DEFAULT_INSTALLER.repoUrl,
    repoBranch: normalizeString(value.repoBranch) || DEFAULT_INSTALLER.repoBranch
  };

  return next;
}

function normalizeStoredSettings(value: unknown): StoredDeliverySettings {
  const raw = normalizeObject(value);

  if (raw.values || raw.secrets || raw.installer) {
    return {
      values: normalizeValueRecord(raw.values),
      secrets: normalizeSecretRecord(raw.secrets),
      installer: normalizeInstallerOverrides(raw.installer)
    };
  }

  return normalizeLegacySettings(raw);
}

function normalizeInputPatch(input: DeliverySettingsInput) {
  const raw = normalizeObject(input);
  if (raw.values || raw.secrets || raw.installer) {
    return {
      values: normalizeValueRecord(raw.values),
      secrets: normalizeSecretRecord(raw.secrets),
      installer: normalizeInstallerOverrides(raw.installer)
    };
  }

  return normalizeLegacySettings(raw);
}

function resolveFieldValue(field: DeliveryManifestField, values: DeliverySettingValues) {
  const current = values[field.key];
  if (typeof current === 'boolean') {
    return current;
  }

  if (typeof current === 'string' && current.trim().length > 0) {
    return current.trim();
  }

  return field.defaultValue;
}

function isFieldConfigured(field: DeliveryManifestField, settings: StoredDeliverySettings) {
  if (!field.required) {
    return true;
  }

  if (field.type === 'secret') {
    return Boolean(settings.secrets[field.key]);
  }

  const value = resolveFieldValue(field, settings.values);
  if (typeof value === 'boolean') {
    return true;
  }

  return typeof value === 'string' && value.trim().length > 0;
}

export class DeliverySettingsService {
  private appDeliverySettingsTableAvailable: Promise<boolean> | null = null;

  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv
  ) {}

  private getEncryptionSecret() {
    return normalizeString(this.env.SETTINGS_ENCRYPTION_KEY) || this.env.JWT_SECRET;
  }

  private getSettingKey(appCode: string) {
    return `deployment.delivery.${appCode}`;
  }

  private async hasCurrentSettingsStore() {
    if (!this.appDeliverySettingsTableAvailable) {
      this.appDeliverySettingsTableAvailable = hasPublicTable(this.db, 'app_delivery_settings');
    }

    return this.appDeliverySettingsTableAvailable;
  }

  private async findCurrentSettingRow(appId: string) {
    if (!(await this.hasCurrentSettingsStore())) {
      return null;
    }

    const [row] = await this.db
      .select()
      .from(appDeliverySettings)
      .where(eq(appDeliverySettings.appId, appId))
      .limit(1);

    return row ?? null;
  }

  private async findLegacySettingRow(appCode: string) {
    const [row] = await this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, this.getSettingKey(appCode)))
      .limit(1);

    return row ?? null;
  }

  private decodeSetting(row: { value: unknown; isEncrypted: boolean }) {
    if (row.isEncrypted) {
      return decryptJson<unknown>(row.value, this.getEncryptionSecret());
    }

    return row.value;
  }

  private async saveLegacyEncryptedSetting(appCode: string, value: StoredDeliverySettings, updatedByUserId: string) {
    const now = new Date();
    const encryptedValue = encryptJson(value, this.getEncryptionSecret());

    await this.db
      .insert(systemSettings)
      .values({
        key: this.getSettingKey(appCode),
        value: encryptedValue,
        isEncrypted: true,
        updatedByUserId,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: encryptedValue,
          isEncrypted: true,
          updatedByUserId,
          updatedAt: now
        }
      });
  }

  private async saveEncryptedSetting(appCode: string, value: StoredDeliverySettings, updatedByUserId: string) {
    const app = await new AppRepository(this.db).findAppByCode(appCode);
    if (!app) {
      throw httpError(404, 'App not found');
    }

    if (!(await this.hasCurrentSettingsStore())) {
      await this.saveLegacyEncryptedSetting(appCode, value, updatedByUserId);
      return;
    }

    const now = new Date();
    const encryptedValue = encryptJson(value, this.getEncryptionSecret());

    await this.db
      .insert(appDeliverySettings)
      .values({
        appId: app.id,
        value: encryptedValue,
        isEncrypted: true,
        updatedByUserId,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: appDeliverySettings.appId,
        set: {
          value: encryptedValue,
          isEncrypted: true,
          updatedByUserId,
          updatedAt: now
        }
      });

    await this.db.delete(systemSettings).where(eq(systemSettings.key, this.getSettingKey(appCode)));
  }

  async deleteSettings(appCode: string) {
    const app = await new AppRepository(this.db).findAppByCode(appCode);
    if (app && (await this.hasCurrentSettingsStore())) {
      await this.db.delete(appDeliverySettings).where(eq(appDeliverySettings.appId, app.id));
    }

    await this.db.delete(systemSettings).where(eq(systemSettings.key, this.getSettingKey(appCode)));
  }

  async getStoredSettings(appCode: string) {
    const app = await new AppRepository(this.db).findAppByCode(appCode);
    if (app) {
      const currentRow = await this.findCurrentSettingRow(app.id);
      if (currentRow) {
        return normalizeStoredSettings(this.decodeSetting(currentRow));
      }
    }

    const legacyRow = await this.findLegacySettingRow(appCode);
    if (!legacyRow) {
      return null;
    }

    return normalizeStoredSettings(this.decodeSetting(legacyRow));
  }

  async getOverview(appCode: string): Promise<DeliverySettingsOverview> {
    const app = await new AppRepository(this.db).findAppByCode(appCode);
    const stored = (await this.getStoredSettings(appCode)) ?? createEmptyStoredSettings();
    const appMeta =
      app?.meta && typeof app.meta === 'object' && !Array.isArray(app.meta)
        ? (app.meta as Record<string, unknown>)
        : {};
    const manifest = normalizeDeliveryManifest(appMeta.deliveryManifest);
    const secretStatuses = Object.fromEntries(
      Object.entries(stored.secrets).map(([key, value]) => [key, { configured: Boolean(value) }])
    );

    for (const field of manifest?.secretFields ?? []) {
      if (!Object.prototype.hasOwnProperty.call(secretStatuses, field.key)) {
        secretStatuses[field.key] = { configured: false };
      }
    }

    for (const key of listDeliveryManifestAssetRequiredSecretKeys(manifest)) {
      if (!Object.prototype.hasOwnProperty.call(secretStatuses, key)) {
        secretStatuses[key] = { configured: false };
      }
    }

    const configured = manifest
      ? listDeliveryManifestFields(manifest, { scope: 'preset' }).every((field) => isFieldConfigured(field, stored)) &&
        listDeliveryManifestAssetRequiredSecretKeys(manifest).every((key) => Boolean(stored.secrets[key]))
      : Boolean(Object.keys(stored.values).length > 0 || Object.keys(stored.secrets).length > 0);

    return {
      appCode,
      configured,
      values: stored.values,
      secrets: secretStatuses
    };
  }

  async upsertSettings(appCode: string, input: DeliverySettingsInput, updatedByUserId: string) {
    const current = (await this.getStoredSettings(appCode)) ?? createEmptyStoredSettings();
    const patch = normalizeInputPatch(input);

    const next: StoredDeliverySettings = {
      values: {
        ...current.values,
        ...patch.values
      },
      secrets: {
        ...current.secrets,
        ...patch.secrets
      },
      installer: {
        repoUrl: patch.installer.repoUrl || current.installer.repoUrl,
        repoBranch: patch.installer.repoBranch || current.installer.repoBranch
      }
    };

    if (next.secrets.GH_TOKEN && !next.secrets.GITHUB_TOKEN) {
      next.secrets.GITHUB_TOKEN = next.secrets.GH_TOKEN;
    }

    await this.saveEncryptedSetting(appCode, next, updatedByUserId);
    return this.getOverview(appCode);
  }
}
