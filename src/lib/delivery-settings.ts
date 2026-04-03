import { eq } from 'drizzle-orm';

import { apps, systemSettings } from '../db/schema';
import type { DbClient } from '../db/types';
import type { AppEnv } from './env';
import { decryptJson, encryptJson } from './settings-crypto';

type SecretStatus = {
  configured: boolean;
};

export type DeliveryFieldType = 'text' | 'url' | 'email' | 'boolean' | 'secret';
export type DeliveryFieldScope = 'system' | 'preset' | 'user_input';
export type DeliveryDomainSourceField = 'primaryDomain' | 'adminDomain' | 'wsDomain';

export type DeliveryFieldGroup = {
  key: string;
  label: string;
  description?: string;
};

export type DeliveryFieldDefinition = {
  key: string;
  label: string;
  description?: string;
  group?: string;
  type: DeliveryFieldType;
  scope: DeliveryFieldScope;
  required: boolean;
  editable?: boolean;
  advanced?: boolean;
  placeholder?: string;
  defaultValue?: string | boolean | null;
};

export type DeliveryDomainSlot = {
  key: string;
  label: string;
  envKey: string;
  sourceField?: DeliveryDomainSourceField;
  required: boolean;
  description?: string;
  placeholder?: string;
};

export type DeliveryManifest = {
  version: '1';
  installer: {
    repoUrl: string;
    repoBranch: string;
    remoteInstallScriptUrl: string;
    installPath: string;
  };
  groups: DeliveryFieldGroup[];
  domainSlots: DeliveryDomainSlot[];
  envFields: DeliveryFieldDefinition[];
  secretFields: DeliveryFieldDefinition[];
  notes?: string[];
};

export type DeliverySettingsOverview = {
  appCode: string;
  configured: boolean;
  manifest: DeliveryManifest;
  values: Record<string, string | boolean | null>;
  secrets: Record<string, SecretStatus>;
};

export type DeliverySettingsInput = {
  values?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
};

type StoredDeliverySettings = {
  values: Record<string, string | boolean | null>;
  secrets: Record<string, string>;
};

const LEGACY_MANIFEST: DeliveryManifest = {
  version: '1',
  installer: {
    repoUrl: 'https://github.com/FutureDecade/fd-headless-wp-system.git',
    repoBranch: 'main',
    remoteInstallScriptUrl:
      'https://raw.githubusercontent.com/FutureDecade/fd-headless-wp-system/main/scripts/remote-install.sh',
    installPath: '/opt/fd-headless-wp-system'
  },
  groups: [
    { key: 'images', label: '镜像与仓库' },
    { key: 'credentials', label: '凭据与证书' },
    { key: 'release', label: '版本与发布', description: '这些字段通常有默认值，除非升级策略变化，否则不需要改动。' }
  ],
  domainSlots: [
    {
      key: 'frontend',
      label: '前台域名',
      envKey: 'FRONTEND_DOMAIN',
      sourceField: 'primaryDomain',
      required: true,
      placeholder: 'www.futuredecade.com'
    },
    {
      key: 'admin',
      label: '后台域名',
      envKey: 'ADMIN_DOMAIN',
      sourceField: 'adminDomain',
      required: true,
      placeholder: 'admin.futuredecade.com'
    },
    {
      key: 'ws',
      label: 'WS 域名',
      envKey: 'WS_DOMAIN',
      sourceField: 'wsDomain',
      required: true,
      placeholder: 'ws.futuredecade.com'
    }
  ],
  envFields: [
    {
      key: 'FRONTEND_IMAGE',
      label: 'Frontend Image',
      type: 'text',
      scope: 'user_input',
      required: true,
      group: 'images'
    },
    {
      key: 'WEBSOCKET_IMAGE',
      label: 'WebSocket Image',
      type: 'text',
      scope: 'user_input',
      required: true,
      group: 'images'
    },
    {
      key: 'LETSENCRYPT_EMAIL',
      label: '证书通知邮箱',
      type: 'email',
      scope: 'user_input',
      required: true,
      group: 'credentials'
    },
    {
      key: 'ACR_USERNAME',
      label: 'ACR 用户名',
      type: 'text',
      scope: 'user_input',
      required: true,
      group: 'credentials'
    },
    {
      key: 'WORDPRESS_FETCH_RELEASE_ASSETS',
      label: '自动拉取 WordPress Release 资产',
      type: 'boolean',
      scope: 'preset',
      required: true,
      editable: true,
      advanced: true,
      defaultValue: true,
      group: 'release'
    },
    {
      key: 'WORDPRESS_RUN_INIT',
      label: '自动执行 WordPress 首次初始化',
      type: 'boolean',
      scope: 'preset',
      required: true,
      editable: true,
      advanced: true,
      defaultValue: true,
      group: 'release'
    },
    {
      key: 'WORDPRESS_RELEASE_OWNER',
      label: 'WordPress Release Owner',
      type: 'text',
      scope: 'preset',
      required: true,
      editable: true,
      advanced: true,
      defaultValue: 'FutureDecade',
      group: 'release'
    },
    {
      key: 'FD_THEME_RELEASE_TAG',
      label: 'fd-theme Release Tag',
      type: 'text',
      scope: 'preset',
      required: true,
      editable: true,
      advanced: true,
      defaultValue: 'v1.0.7',
      group: 'release'
    },
    {
      key: 'FD_ADMIN_UI_RELEASE_TAG',
      label: 'fd-admin-ui Release Tag',
      type: 'text',
      scope: 'preset',
      required: true,
      editable: true,
      advanced: true,
      defaultValue: 'v1.3.1',
      group: 'release'
    },
    {
      key: 'FD_MEMBER_RELEASE_TAG',
      label: 'fd-member Release Tag',
      type: 'text',
      scope: 'preset',
      required: true,
      editable: true,
      advanced: true,
      defaultValue: 'v1.0.1',
      group: 'release'
    },
    {
      key: 'FD_PAYMENT_RELEASE_TAG',
      label: 'fd-payment Release Tag',
      type: 'text',
      scope: 'preset',
      required: true,
      editable: true,
      advanced: true,
      defaultValue: 'v1.0.0',
      group: 'release'
    },
    {
      key: 'FD_COMMERCE_RELEASE_TAG',
      label: 'fd-commerce Release Tag',
      type: 'text',
      scope: 'preset',
      required: true,
      editable: true,
      advanced: true,
      defaultValue: 'v1.0.0',
      group: 'release'
    },
    {
      key: 'FD_CONTENT_TYPES_RELEASE_TAG',
      label: 'fd-content-types Release Tag',
      type: 'text',
      scope: 'preset',
      required: true,
      editable: true,
      advanced: true,
      defaultValue: 'v0.1.0',
      group: 'release'
    },
    {
      key: 'FD_WEBSOCKET_PUSH_RELEASE_TAG',
      label: 'fd-websocket-push Release Tag',
      type: 'text',
      scope: 'preset',
      required: true,
      editable: true,
      advanced: true,
      defaultValue: 'v1.0.0',
      group: 'release'
    },
    {
      key: 'WPGRAPHQL_JWT_AUTH_RELEASE_TAG',
      label: 'WPGraphQL JWT Auth Release Tag',
      type: 'text',
      scope: 'preset',
      required: true,
      editable: true,
      advanced: true,
      defaultValue: 'v0.7.2',
      group: 'release'
    },
    {
      key: 'WPGRAPHQL_TAX_QUERY_REF',
      label: 'WPGraphQL Tax Query Ref',
      type: 'text',
      scope: 'preset',
      required: true,
      editable: true,
      advanced: true,
      defaultValue: 'v0.2.0',
      group: 'release'
    }
  ],
  secretFields: [
    {
      key: 'ACR_PASSWORD',
      label: 'ACR 密码',
      type: 'secret',
      scope: 'user_input',
      required: true,
      group: 'credentials'
    },
    {
      key: 'GH_TOKEN',
      label: 'GitHub Token',
      type: 'secret',
      scope: 'user_input',
      required: true,
      group: 'credentials'
    }
  ],
  notes: [
    'Legacy FutureDecade delivery manifest fallback.',
    'New products should declare their own app.meta.deliveryManifest instead of relying on this fallback.'
  ]
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

function normalizeFieldType(value: unknown): DeliveryFieldType {
  return value === 'url' || value === 'email' || value === 'boolean' || value === 'secret' ? value : 'text';
}

function normalizeFieldScope(value: unknown): DeliveryFieldScope {
  return value === 'system' || value === 'preset' || value === 'user_input' ? value : 'preset';
}

function cloneManifest(manifest: DeliveryManifest): DeliveryManifest {
  return {
    version: '1',
    installer: { ...manifest.installer },
    groups: manifest.groups.map((group) => ({ ...group })),
    domainSlots: manifest.domainSlots.map((slot) => ({ ...slot })),
    envFields: manifest.envFields.map((field) => ({ ...field })),
    secretFields: manifest.secretFields.map((field) => ({ ...field })),
    notes: manifest.notes ? [...manifest.notes] : undefined
  };
}

function normalizeManifest(value: unknown): DeliveryManifest {
  const raw = normalizeObject(value);
  if (!raw || Object.keys(raw).length === 0) {
    return cloneManifest(LEGACY_MANIFEST);
  }

  const installerRaw = normalizeObject(raw.installer);
  const installer = {
    repoUrl: normalizeString(installerRaw.repoUrl) || LEGACY_MANIFEST.installer.repoUrl,
    repoBranch: normalizeString(installerRaw.repoBranch) || LEGACY_MANIFEST.installer.repoBranch,
    remoteInstallScriptUrl:
      normalizeString(installerRaw.remoteInstallScriptUrl) || LEGACY_MANIFEST.installer.remoteInstallScriptUrl,
    installPath: normalizeString(installerRaw.installPath) || LEGACY_MANIFEST.installer.installPath
  };

  const groups: DeliveryFieldGroup[] = [];
  if (Array.isArray(raw.groups)) {
    for (const item of raw.groups) {
      const group = normalizeObject(item);
      const key = normalizeString(group.key);
      const label = normalizeString(group.label);
      if (!key || !label) {
        continue;
      }

      groups.push({
        key,
        label,
        description: normalizeString(group.description) || undefined
      });
    }
  }

  const domainSlots: DeliveryDomainSlot[] = [];
  if (Array.isArray(raw.domainSlots)) {
    for (const item of raw.domainSlots) {
      const slot = normalizeObject(item);
      const key = normalizeString(slot.key);
      const label = normalizeString(slot.label);
      const envKey = normalizeString(slot.envKey);
      const sourceField =
        slot.sourceField === 'primaryDomain' || slot.sourceField === 'adminDomain' || slot.sourceField === 'wsDomain'
          ? slot.sourceField
          : undefined;

      if (!key || !label || !envKey) {
        continue;
      }

      domainSlots.push({
        key,
        label,
        envKey,
        sourceField,
        required: normalizeBoolean(slot.required, true),
        description: normalizeString(slot.description) || undefined,
        placeholder: normalizeString(slot.placeholder) || undefined
      });
    }
  }

  const normalizeFieldList = (input: unknown, fallback: DeliveryFieldDefinition[]) => {
    if (!Array.isArray(input)) {
      return fallback.map((field) => ({ ...field }));
    }

    const fields: DeliveryFieldDefinition[] = [];
    for (const item of input) {
      const field = normalizeObject(item);
      const key = normalizeString(field.key);
      const label = normalizeString(field.label);

      if (!key || !label) {
        continue;
      }

      fields.push({
        key,
        label,
        description: normalizeString(field.description) || undefined,
        group: normalizeString(field.group) || undefined,
        type: normalizeFieldType(field.type),
        scope: normalizeFieldScope(field.scope),
        required: normalizeBoolean(field.required, false),
        editable: normalizeBoolean(field.editable, true),
        advanced: normalizeBoolean(field.advanced, false),
        placeholder: normalizeString(field.placeholder) || undefined,
        defaultValue:
          typeof field.defaultValue === 'string' || typeof field.defaultValue === 'boolean'
            ? field.defaultValue
            : null
      });
    }

    return fields;
  };

  const envFields = normalizeFieldList(raw.envFields, LEGACY_MANIFEST.envFields);
  const secretFields = normalizeFieldList(raw.secretFields, LEGACY_MANIFEST.secretFields);

  return {
    version: '1',
    installer,
    groups: groups.length > 0 ? groups : cloneManifest(LEGACY_MANIFEST).groups,
    domainSlots: domainSlots.length > 0 ? domainSlots : cloneManifest(LEGACY_MANIFEST).domainSlots,
    envFields,
    secretFields,
    notes: Array.isArray(raw.notes)
      ? raw.notes.map((item) => normalizeString(item)).filter(Boolean)
      : LEGACY_MANIFEST.notes
  };
}

export function parseDeliveryManifest(value: unknown) {
  return normalizeManifest(value);
}

function normalizeFieldValue(field: DeliveryFieldDefinition, value: unknown) {
  if (field.type === 'boolean') {
    return normalizeBoolean(value, typeof field.defaultValue === 'boolean' ? field.defaultValue : false);
  }

  const normalized = normalizeString(value);
  if (normalized) {
    return normalized;
  }

  if (typeof field.defaultValue === 'string' || typeof field.defaultValue === 'boolean') {
    return field.defaultValue;
  }

  return null;
}

function buildValueDefaults(fields: DeliveryFieldDefinition[]) {
  return Object.fromEntries(fields.map((field) => [field.key, normalizeFieldValue(field, undefined)]));
}

function normalizeLegacyStoredSettings(raw: Record<string, unknown>, manifest: DeliveryManifest): StoredDeliverySettings {
  const values = buildValueDefaults(manifest.envFields);
  const secrets: Record<string, string> = {};

  for (const field of manifest.envFields) {
    const legacyValue = raw[field.key] ?? raw[toLegacyCamelKey(field.key)];
    values[field.key] = normalizeFieldValue(field, legacyValue);
  }

  for (const field of manifest.secretFields) {
    const legacyValue = raw[field.key] ?? raw[toLegacyCamelKey(field.key)];
    secrets[field.key] = normalizeString(legacyValue);
  }

  return { values, secrets };
}

function toLegacyCamelKey(key: string) {
  const parts = key.toLowerCase().split('_');
  return parts
    .map((part, index) => (index === 0 ? part : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`))
    .join('');
}

function hasStructuredStoredSettings(raw: Record<string, unknown>) {
  return raw.values && typeof raw.values === 'object' && !Array.isArray(raw.values);
}

export class DeliverySettingsService {
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

  private async findSettingRow(appCode: string) {
    const [row] = await this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, this.getSettingKey(appCode)))
      .limit(1);

    return row ?? null;
  }

  private async findAppMeta(appCode: string) {
    const [app] = await this.db.select({ meta: apps.meta }).from(apps).where(eq(apps.code, appCode)).limit(1);
    return app?.meta;
  }

  private decodeSetting(row: NonNullable<Awaited<ReturnType<DeliverySettingsService['findSettingRow']>>>) {
    if (row.isEncrypted) {
      return decryptJson<unknown>(row.value, this.getEncryptionSecret());
    }

    return row.value;
  }

  async getManifest(appCode: string) {
    const meta = normalizeObject(await this.findAppMeta(appCode));
    const manifestCandidate = meta.deliveryManifest ?? meta.deploymentManifest ?? null;
    return normalizeManifest(manifestCandidate);
  }

  private normalizeStoredSettings(value: unknown, manifest: DeliveryManifest): StoredDeliverySettings {
    const raw = normalizeObject(value);
    if (hasStructuredStoredSettings(raw)) {
      const valuesRaw = normalizeObject(raw.values);
      const secretsRaw = normalizeObject(raw.secrets);

      return {
        values: Object.fromEntries(
          manifest.envFields.map((field) => [field.key, normalizeFieldValue(field, valuesRaw[field.key])])
        ),
        secrets: Object.fromEntries(
          manifest.secretFields.map((field) => [field.key, normalizeString(secretsRaw[field.key])])
        )
      };
    }

    return normalizeLegacyStoredSettings(raw, manifest);
  }

  private async saveEncryptedSetting(appCode: string, value: StoredDeliverySettings, updatedByUserId: string) {
    const now = new Date();

    await this.db
      .insert(systemSettings)
      .values({
        key: this.getSettingKey(appCode),
        value: encryptJson(value, this.getEncryptionSecret()),
        isEncrypted: true,
        updatedByUserId,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: encryptJson(value, this.getEncryptionSecret()),
          isEncrypted: true,
          updatedByUserId,
          updatedAt: now
        }
      });
  }

  private isValueConfigured(field: DeliveryFieldDefinition, value: string | boolean | null) {
    if (field.type === 'boolean') {
      return typeof value === 'boolean';
    }

    return typeof value === 'string' && value.trim().length > 0;
  }

  async deleteSettings(appCode: string) {
    await this.db.delete(systemSettings).where(eq(systemSettings.key, this.getSettingKey(appCode)));
  }

  async getStoredSettings(appCode: string) {
    const manifest = await this.getManifest(appCode);
    const row = await this.findSettingRow(appCode);
    if (!row) {
      return {
        manifest,
        values: buildValueDefaults(manifest.envFields),
        secrets: Object.fromEntries(manifest.secretFields.map((field) => [field.key, '']))
      } satisfies { manifest: DeliveryManifest; values: Record<string, string | boolean | null>; secrets: Record<string, string> };
    }

    const stored = this.normalizeStoredSettings(this.decodeSetting(row), manifest);

    return {
      manifest,
      values: stored.values,
      secrets: stored.secrets
    };
  }

  async getOverview(appCode: string): Promise<DeliverySettingsOverview> {
    const stored = await this.getStoredSettings(appCode);

    const configured =
      stored.manifest.envFields
        .filter((field) => field.required)
        .every((field) => this.isValueConfigured(field, stored.values[field.key] ?? null)) &&
      stored.manifest.secretFields
        .filter((field) => field.required)
        .every((field) => Boolean(stored.secrets[field.key]));

    return {
      appCode,
      configured,
      manifest: stored.manifest,
      values: stored.values,
      secrets: Object.fromEntries(
        stored.manifest.secretFields.map((field) => [field.key, { configured: Boolean(stored.secrets[field.key]) }])
      )
    };
  }

  async upsertSettings(appCode: string, input: DeliverySettingsInput, updatedByUserId: string) {
    const current = await this.getStoredSettings(appCode);

    const nextValues = { ...current.values };
    const nextSecrets = { ...current.secrets };

    const inputValues = normalizeObject(input.values);
    const inputSecrets = normalizeObject(input.secrets);

    for (const field of current.manifest.envFields) {
      if (!field.editable || !(field.key in inputValues)) {
        continue;
      }

      nextValues[field.key] = normalizeFieldValue(field, inputValues[field.key]);
    }

    for (const field of current.manifest.secretFields) {
      if (!(field.key in inputSecrets)) {
        continue;
      }

      const nextValue = normalizeString(inputSecrets[field.key]);
      if (nextValue) {
        nextSecrets[field.key] = nextValue;
      }
    }

    await this.saveEncryptedSetting(
      appCode,
      {
        values: nextValues,
        secrets: nextSecrets
      },
      updatedByUserId
    );

    return this.getOverview(appCode);
  }

  async buildBootstrapContext(appCode: string) {
    const stored = await this.getStoredSettings(appCode);
    return {
      manifest: stored.manifest,
      values: stored.values,
      secrets: stored.secrets
    };
  }
}

export { LEGACY_MANIFEST };
