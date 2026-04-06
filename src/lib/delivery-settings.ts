import { eq } from 'drizzle-orm';

import { appDeliverySettings, systemSettings } from '../db/schema';
import type { DbClient } from '../db/types';
import { AppRepository } from '../modules/app/repository';
import { hasPublicTable } from './db-compat';
import type { AppEnv } from './env';
import { httpError } from './errors';
import { decryptJson, encryptJson } from './settings-crypto';

type SecretStatus = {
  configured: boolean;
};

export type DeliverySettingValues = {
  repoUrl: string;
  repoBranch: string;
  frontendImage: string;
  websocketImage: string;
  letsencryptEmail: string;
  acrUsername: string;
  wordpressFetchReleaseAssets: boolean;
  wordpressRunInit: boolean;
  wordpressReleaseOwner: string;
  fdThemeReleaseTag: string;
  fdAdminUiReleaseTag: string;
  fdMemberReleaseTag: string;
  fdPaymentReleaseTag: string;
  fdCommerceReleaseTag: string;
  fdContentTypesReleaseTag: string;
  fdWebsocketPushReleaseTag: string;
  wpgraphqlJwtAuthReleaseTag: string;
  wpgraphqlTaxQueryRef: string;
};

export type DeliverySettingsOverview = {
  appCode: string;
  configured: boolean;
  values: DeliverySettingValues;
  secrets: {
    acrPassword: SecretStatus;
    githubToken: SecretStatus;
  };
};

export type DeliverySettingsInput = Partial<DeliverySettingValues> & {
  acrPassword?: string;
  githubToken?: string;
};

type StoredDeliverySettings = DeliverySettingValues & {
  acrPassword: string;
  githubToken: string;
};

const DEFAULTS: DeliverySettingValues = {
  repoUrl: 'https://github.com/FutureDecade/fd-headless-wp-system.git',
  repoBranch: 'main',
  frontendImage: '',
  websocketImage: '',
  letsencryptEmail: '',
  acrUsername: '',
  wordpressFetchReleaseAssets: true,
  wordpressRunInit: true,
  wordpressReleaseOwner: 'FutureDecade',
  fdThemeReleaseTag: 'v1.0.7',
  fdAdminUiReleaseTag: 'v1.3.1',
  fdMemberReleaseTag: 'v1.0.1',
  fdPaymentReleaseTag: 'v1.0.0',
  fdCommerceReleaseTag: 'v1.0.0',
  fdContentTypesReleaseTag: 'v0.1.0',
  fdWebsocketPushReleaseTag: 'v1.0.0',
  wpgraphqlJwtAuthReleaseTag: 'v0.7.2',
  wpgraphqlTaxQueryRef: 'v0.2.0'
};

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBoolean(value: unknown, fallback: boolean) {
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

  return fallback;
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
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

  private normalizeStoredSettings(value: unknown): StoredDeliverySettings {
    const raw = normalizeObject(value);

    return {
      repoUrl: normalizeString(raw.repoUrl) || DEFAULTS.repoUrl,
      repoBranch: normalizeString(raw.repoBranch) || DEFAULTS.repoBranch,
      frontendImage: normalizeString(raw.frontendImage),
      websocketImage: normalizeString(raw.websocketImage),
      letsencryptEmail: normalizeString(raw.letsencryptEmail),
      acrUsername: normalizeString(raw.acrUsername),
      acrPassword: normalizeString(raw.acrPassword),
      githubToken: normalizeString(raw.githubToken),
      wordpressFetchReleaseAssets: normalizeBoolean(raw.wordpressFetchReleaseAssets, DEFAULTS.wordpressFetchReleaseAssets),
      wordpressRunInit: normalizeBoolean(raw.wordpressRunInit, DEFAULTS.wordpressRunInit),
      wordpressReleaseOwner: normalizeString(raw.wordpressReleaseOwner) || DEFAULTS.wordpressReleaseOwner,
      fdThemeReleaseTag: normalizeString(raw.fdThemeReleaseTag) || DEFAULTS.fdThemeReleaseTag,
      fdAdminUiReleaseTag: normalizeString(raw.fdAdminUiReleaseTag) || DEFAULTS.fdAdminUiReleaseTag,
      fdMemberReleaseTag: normalizeString(raw.fdMemberReleaseTag) || DEFAULTS.fdMemberReleaseTag,
      fdPaymentReleaseTag: normalizeString(raw.fdPaymentReleaseTag) || DEFAULTS.fdPaymentReleaseTag,
      fdCommerceReleaseTag: normalizeString(raw.fdCommerceReleaseTag) || DEFAULTS.fdCommerceReleaseTag,
      fdContentTypesReleaseTag: normalizeString(raw.fdContentTypesReleaseTag) || DEFAULTS.fdContentTypesReleaseTag,
      fdWebsocketPushReleaseTag: normalizeString(raw.fdWebsocketPushReleaseTag) || DEFAULTS.fdWebsocketPushReleaseTag,
      wpgraphqlJwtAuthReleaseTag:
        normalizeString(raw.wpgraphqlJwtAuthReleaseTag) || DEFAULTS.wpgraphqlJwtAuthReleaseTag,
      wpgraphqlTaxQueryRef: normalizeString(raw.wpgraphqlTaxQueryRef) || DEFAULTS.wpgraphqlTaxQueryRef
    };
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
        return this.normalizeStoredSettings(this.decodeSetting(currentRow));
      }
    }

    const legacyRow = await this.findLegacySettingRow(appCode);
    if (!legacyRow) {
      return null;
    }

    return this.normalizeStoredSettings(this.decodeSetting(legacyRow));
  }

  async getOverview(appCode: string): Promise<DeliverySettingsOverview> {
    const stored = (await this.getStoredSettings(appCode)) ?? {
      ...DEFAULTS,
      acrPassword: '',
      githubToken: ''
    };

    const values: DeliverySettingValues = {
      repoUrl: stored.repoUrl,
      repoBranch: stored.repoBranch,
      frontendImage: stored.frontendImage,
      websocketImage: stored.websocketImage,
      letsencryptEmail: stored.letsencryptEmail,
      acrUsername: stored.acrUsername,
      wordpressFetchReleaseAssets: stored.wordpressFetchReleaseAssets,
      wordpressRunInit: stored.wordpressRunInit,
      wordpressReleaseOwner: stored.wordpressReleaseOwner,
      fdThemeReleaseTag: stored.fdThemeReleaseTag,
      fdAdminUiReleaseTag: stored.fdAdminUiReleaseTag,
      fdMemberReleaseTag: stored.fdMemberReleaseTag,
      fdPaymentReleaseTag: stored.fdPaymentReleaseTag,
      fdCommerceReleaseTag: stored.fdCommerceReleaseTag,
      fdContentTypesReleaseTag: stored.fdContentTypesReleaseTag,
      fdWebsocketPushReleaseTag: stored.fdWebsocketPushReleaseTag,
      wpgraphqlJwtAuthReleaseTag: stored.wpgraphqlJwtAuthReleaseTag,
      wpgraphqlTaxQueryRef: stored.wpgraphqlTaxQueryRef
    };

    return {
      appCode,
      configured: Boolean(
        values.frontendImage &&
          values.websocketImage &&
          values.acrUsername &&
          stored.acrPassword &&
          stored.githubToken
      ),
      values,
      secrets: {
        acrPassword: { configured: Boolean(stored.acrPassword) },
        githubToken: { configured: Boolean(stored.githubToken) }
      }
    };
  }

  async upsertSettings(appCode: string, input: DeliverySettingsInput, updatedByUserId: string) {
    const current = (await this.getStoredSettings(appCode)) ?? {
      ...DEFAULTS,
      acrPassword: '',
      githubToken: ''
    };

    const next: StoredDeliverySettings = {
      repoUrl: normalizeString(input.repoUrl) || current.repoUrl,
      repoBranch: normalizeString(input.repoBranch) || current.repoBranch,
      frontendImage: normalizeString(input.frontendImage) || current.frontendImage,
      websocketImage: normalizeString(input.websocketImage) || current.websocketImage,
      letsencryptEmail: normalizeString(input.letsencryptEmail) || current.letsencryptEmail,
      acrUsername: normalizeString(input.acrUsername) || current.acrUsername,
      acrPassword: normalizeString(input.acrPassword) || current.acrPassword,
      githubToken: normalizeString(input.githubToken) || current.githubToken,
      wordpressFetchReleaseAssets:
        typeof input.wordpressFetchReleaseAssets === 'boolean'
          ? input.wordpressFetchReleaseAssets
          : current.wordpressFetchReleaseAssets,
      wordpressRunInit:
        typeof input.wordpressRunInit === 'boolean' ? input.wordpressRunInit : current.wordpressRunInit,
      wordpressReleaseOwner: normalizeString(input.wordpressReleaseOwner) || current.wordpressReleaseOwner,
      fdThemeReleaseTag: normalizeString(input.fdThemeReleaseTag) || current.fdThemeReleaseTag,
      fdAdminUiReleaseTag: normalizeString(input.fdAdminUiReleaseTag) || current.fdAdminUiReleaseTag,
      fdMemberReleaseTag: normalizeString(input.fdMemberReleaseTag) || current.fdMemberReleaseTag,
      fdPaymentReleaseTag: normalizeString(input.fdPaymentReleaseTag) || current.fdPaymentReleaseTag,
      fdCommerceReleaseTag: normalizeString(input.fdCommerceReleaseTag) || current.fdCommerceReleaseTag,
      fdContentTypesReleaseTag: normalizeString(input.fdContentTypesReleaseTag) || current.fdContentTypesReleaseTag,
      fdWebsocketPushReleaseTag:
        normalizeString(input.fdWebsocketPushReleaseTag) || current.fdWebsocketPushReleaseTag,
      wpgraphqlJwtAuthReleaseTag:
        normalizeString(input.wpgraphqlJwtAuthReleaseTag) || current.wpgraphqlJwtAuthReleaseTag,
      wpgraphqlTaxQueryRef: normalizeString(input.wpgraphqlTaxQueryRef) || current.wpgraphqlTaxQueryRef
    };

    await this.saveEncryptedSetting(appCode, next, updatedByUserId);
    return this.getOverview(appCode);
  }
}
