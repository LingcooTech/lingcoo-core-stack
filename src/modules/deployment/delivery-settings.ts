import { eq } from 'drizzle-orm';

import { appDeliverySettings } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import { createAppAccess } from '../app/public';
import {
  listDeliveryManifestAssetRequiredSecretKeys,
  listDeliveryManifestFields,
  normalizeDeliveryManifest,
  type DeliveryManifestField,
} from '../../lib/delivery-manifest';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { decryptJson, encryptJson, getEncryptionKeys } from '../../lib/settings-crypto';

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
    installer: { repoUrl: '', repoBranch: '' },
  };
}

function normalizeInstallerOverrides(value: unknown) {
  const raw = normalizeObject(value);

  return {
    repoUrl: normalizeString(raw.repoUrl),
    repoBranch: normalizeString(raw.repoBranch),
  };
}

function normalizeStoredSettings(value: unknown): StoredDeliverySettings {
  const raw = normalizeObject(value);

  if (raw.values || raw.secrets || raw.installer) {
    return {
      values: normalizeValueRecord(raw.values),
      secrets: normalizeSecretRecord(raw.secrets),
      installer: normalizeInstallerOverrides(raw.installer),
    };
  }

  if (Object.keys(raw).length)
    throw httpError(409, 'Delivery settings require migration to the manifest-based format');
  return createEmptyStoredSettings();
}

function normalizeInputPatch(input: DeliverySettingsInput) {
  const raw = normalizeObject(input);
  if (raw.values || raw.secrets || raw.installer) {
    return {
      values: normalizeValueRecord(raw.values),
      secrets: normalizeSecretRecord(raw.secrets),
      installer: normalizeInstallerOverrides(raw.installer),
    };
  }

  if (Object.keys(raw).length)
    throw httpError(409, 'Delivery settings require migration to the manifest-based format');
  return createEmptyStoredSettings();
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
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
  ) {}

  private getEncryptionSecret() {
    return getEncryptionKeys(this.env);
  }

  private async findCurrentSettingRow(appId: string) {
    const [row] = await this.db
      .select()
      .from(appDeliverySettings)
      .where(eq(appDeliverySettings.appId, appId))
      .limit(1);

    return row ?? null;
  }

  private decodeSetting(row: { value: unknown; isEncrypted: boolean }) {
    if (row.isEncrypted) {
      return decryptJson<unknown>(row.value, this.getEncryptionSecret());
    }

    return row.value;
  }

  private async saveEncryptedSetting(
    appCode: string,
    value: StoredDeliverySettings,
    updatedByUserId: string,
  ) {
    const app = await createAppAccess(this.db).findAppByCode(appCode);
    if (!app) {
      throw httpError(404, 'App not found');
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
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: appDeliverySettings.appId,
        set: {
          value: encryptedValue,
          isEncrypted: true,
          updatedByUserId,
          updatedAt: now,
        },
      });
  }

  async deleteSettings(appCode: string) {
    const app = await createAppAccess(this.db).findAppByCode(appCode);
    if (app) {
      await this.db.delete(appDeliverySettings).where(eq(appDeliverySettings.appId, app.id));
    }
  }

  async getStoredSettings(appCode: string) {
    const app = await createAppAccess(this.db).findAppByCode(appCode);
    if (app) {
      const currentRow = await this.findCurrentSettingRow(app.id);
      if (currentRow) {
        return normalizeStoredSettings(this.decodeSetting(currentRow));
      }
    }

    return null;
  }

  async getOverview(appCode: string): Promise<DeliverySettingsOverview> {
    const app = await createAppAccess(this.db).findAppByCode(appCode);
    const stored = (await this.getStoredSettings(appCode)) ?? createEmptyStoredSettings();
    const appMeta =
      app?.meta && typeof app.meta === 'object' && !Array.isArray(app.meta)
        ? (app.meta as Record<string, unknown>)
        : {};
    const manifest = normalizeDeliveryManifest(appMeta.deliveryManifest);
    const secretStatuses = Object.fromEntries(
      Object.entries(stored.secrets).map(([key, value]) => [key, { configured: Boolean(value) }]),
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
      ? listDeliveryManifestFields(manifest, { scope: 'preset' }).every((field) =>
          isFieldConfigured(field, stored),
        ) &&
        listDeliveryManifestAssetRequiredSecretKeys(manifest).every((key) =>
          Boolean(stored.secrets[key]),
        )
      : Boolean(Object.keys(stored.values).length > 0 || Object.keys(stored.secrets).length > 0);

    return {
      appCode,
      configured,
      values: stored.values,
      secrets: secretStatuses,
    };
  }

  async upsertSettings(appCode: string, input: DeliverySettingsInput, updatedByUserId: string) {
    const current = (await this.getStoredSettings(appCode)) ?? createEmptyStoredSettings();
    const patch = normalizeInputPatch(input);

    const next: StoredDeliverySettings = {
      values: {
        ...current.values,
        ...patch.values,
      },
      secrets: {
        ...current.secrets,
        ...patch.secrets,
      },
      installer: {
        repoUrl: patch.installer.repoUrl || current.installer.repoUrl,
        repoBranch: patch.installer.repoBranch || current.installer.repoBranch,
      },
    };

    await this.saveEncryptedSetting(appCode, next, updatedByUserId);
    return this.getOverview(appCode);
  }
}
