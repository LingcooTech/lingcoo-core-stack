type DeliveryManifestValue = string | boolean;

export type DeliveryManifestFieldScope = 'user_input' | 'preset';
export type DeliveryManifestFieldType = 'text' | 'email' | 'boolean' | 'secret';
export type DeliveryManifestDomainSourceField = string;
export type DeliveryManifestAssetType =
  | 'github_release'
  | 'docker_image'
  | 'qiniu_object'
  | 'http_file'
  | 'custom';
export type DeliveryManifestAssetVisibility = 'public' | 'private';

export interface DeliveryManifestInstaller {
  repoUrl: string;
  repoBranch: string;
  remoteInstallScriptUrl: string;
  installPath: string;
}

export interface DeliveryManifestGroup {
  key: string;
  label: string;
  description?: string;
}

export interface DeliveryManifestDomainSlot {
  key: string;
  label: string;
  envKey: string;
  sourceField: DeliveryManifestDomainSourceField;
  required: boolean;
  placeholder?: string;
  description?: string;
}

export interface DeliveryManifestField {
  key: string;
  label: string;
  type: DeliveryManifestFieldType;
  scope: DeliveryManifestFieldScope;
  required: boolean;
  editable: boolean;
  advanced: boolean;
  group?: string;
  placeholder?: string;
  description?: string;
  defaultValue?: DeliveryManifestValue;
}

export interface DeliveryManifestAsset {
  key: string;
  label: string;
  type: DeliveryManifestAssetType;
  required: boolean;
  visibility: DeliveryManifestAssetVisibility;
  group?: string;
  description?: string;
  repo?: string;
  file?: string;
  path?: string;
  tag?: string;
  tagEnv?: string;
  image?: string;
  imageEnv?: string;
  url?: string;
  urlEnv?: string;
  authSecret?: string;
  checksum?: string;
  checksumEnv?: string;
}

export interface DeliveryManifest {
  version: string;
  installer: DeliveryManifestInstaller;
  groups: DeliveryManifestGroup[];
  domainSlots: DeliveryManifestDomainSlot[];
  envFields: DeliveryManifestField[];
  secretFields: DeliveryManifestField[];
  assets: DeliveryManifestAsset[];
  notes: string[];
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

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

function normalizeNotes(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeString(item))
    .filter((item) => item.length > 0);
}

function normalizeScope(value: unknown): DeliveryManifestFieldScope {
  return normalizeString(value) === 'preset' ? 'preset' : 'user_input';
}

function normalizeFieldType(value: unknown, fallback: DeliveryManifestFieldType): DeliveryManifestFieldType {
  const normalized = normalizeString(value);
  if (normalized === 'text' || normalized === 'email' || normalized === 'boolean' || normalized === 'secret') {
    return normalized;
  }

  return fallback;
}

function normalizeFieldDefaultValue(type: DeliveryManifestFieldType, value: unknown) {
  if (type === 'boolean') {
    return normalizeBoolean(value);
  }

  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeField(
  value: unknown,
  fallbackType: DeliveryManifestFieldType
): DeliveryManifestField | null {
  const raw = normalizeObject(value);
  const key = normalizeString(raw.key);
  const label = normalizeString(raw.label);

  if (!key || !label) {
    return null;
  }

  const type = normalizeFieldType(raw.type, fallbackType);
  const defaultValue = normalizeFieldDefaultValue(type, raw.defaultValue);

  return {
    key,
    label,
    type,
    scope: normalizeScope(raw.scope),
    required: normalizeBoolean(raw.required) ?? false,
    editable: normalizeBoolean(raw.editable) ?? true,
    advanced: normalizeBoolean(raw.advanced) ?? false,
    group: normalizeString(raw.group) || undefined,
    placeholder: normalizeString(raw.placeholder) || undefined,
    description: normalizeString(raw.description) || undefined,
    defaultValue
  };
}

function normalizeAssetType(value: unknown): DeliveryManifestAssetType {
  const normalized = normalizeString(value);
  if (
    normalized === 'github_release' ||
    normalized === 'docker_image' ||
    normalized === 'qiniu_object' ||
    normalized === 'http_file' ||
    normalized === 'custom'
  ) {
    return normalized;
  }

  return 'custom';
}

function normalizeAssetVisibility(value: unknown): DeliveryManifestAssetVisibility {
  return normalizeString(value) === 'private' ? 'private' : 'public';
}

function normalizeAsset(value: unknown): DeliveryManifestAsset | null {
  const raw = normalizeObject(value);
  const key = normalizeString(raw.key);
  const label = normalizeString(raw.label);

  if (!key || !label) {
    return null;
  }

  return {
    key,
    label,
    type: normalizeAssetType(raw.type),
    required: normalizeBoolean(raw.required) ?? true,
    visibility: normalizeAssetVisibility(raw.visibility),
    group: normalizeString(raw.group) || undefined,
    description: normalizeString(raw.description) || undefined,
    repo: normalizeString(raw.repo) || undefined,
    file: normalizeString(raw.file) || undefined,
    path: normalizeString(raw.path) || undefined,
    tag: normalizeString(raw.tag) || undefined,
    tagEnv: normalizeString(raw.tagEnv) || undefined,
    image: normalizeString(raw.image) || undefined,
    imageEnv: normalizeString(raw.imageEnv) || undefined,
    url: normalizeString(raw.url) || undefined,
    urlEnv: normalizeString(raw.urlEnv) || undefined,
    authSecret: normalizeString(raw.authSecret) || undefined,
    checksum: normalizeString(raw.checksum) || undefined,
    checksumEnv: normalizeString(raw.checksumEnv) || undefined
  };
}

function normalizeGroup(value: unknown): DeliveryManifestGroup | null {
  const raw = normalizeObject(value);
  const key = normalizeString(raw.key);
  const label = normalizeString(raw.label);

  if (!key || !label) {
    return null;
  }

  return {
    key,
    label,
    description: normalizeString(raw.description) || undefined
  };
}

function normalizeDomainSlot(value: unknown): DeliveryManifestDomainSlot | null {
  const raw = normalizeObject(value);
  const key = normalizeString(raw.key);
  const label = normalizeString(raw.label);
  const envKey = normalizeString(raw.envKey);
  const sourceField = normalizeString(raw.sourceField) || key;

  if (!key || !label || !envKey || !sourceField) {
    return null;
  }

  return {
    key,
    label,
    envKey,
    sourceField,
    required: normalizeBoolean(raw.required) ?? false,
    placeholder: normalizeString(raw.placeholder) || undefined,
    description: normalizeString(raw.description) || undefined
  };
}

export function normalizeDeliveryManifest(value: unknown): DeliveryManifest | null {
  const raw = normalizeObject(value);
  if (Object.keys(raw).length === 0) {
    return null;
  }

  const installerRaw = normalizeObject(raw.installer);
  const installer: DeliveryManifestInstaller = {
    repoUrl: normalizeString(installerRaw.repoUrl),
    repoBranch: normalizeString(installerRaw.repoBranch) || 'main',
    remoteInstallScriptUrl: normalizeString(installerRaw.remoteInstallScriptUrl),
    installPath: normalizeString(installerRaw.installPath) || '/opt/fd-headless-wp-system'
  };

  return {
    version: normalizeString(raw.version) || '1',
    installer,
    groups: Array.isArray(raw.groups)
      ? raw.groups
          .map((item) => normalizeGroup(item))
          .filter((item): item is DeliveryManifestGroup => Boolean(item))
      : [],
    domainSlots: Array.isArray(raw.domainSlots)
      ? raw.domainSlots
          .map((item) => normalizeDomainSlot(item))
          .filter((item): item is DeliveryManifestDomainSlot => Boolean(item))
      : [],
    envFields: Array.isArray(raw.envFields)
      ? raw.envFields
          .map((item) => normalizeField(item, 'text'))
          .filter((item): item is DeliveryManifestField => Boolean(item))
      : [],
    secretFields: Array.isArray(raw.secretFields)
      ? raw.secretFields
          .map((item) => normalizeField(item, 'secret'))
          .filter((item): item is DeliveryManifestField => Boolean(item))
          .map((item) => ({ ...item, type: 'secret' as const }))
      : [],
    assets: Array.isArray(raw.assets)
      ? raw.assets
          .map((item) => normalizeAsset(item))
          .filter((item): item is DeliveryManifestAsset => Boolean(item))
      : [],
    notes: normalizeNotes(raw.notes)
  };
}

export function listDeliveryManifestFields(
  manifest: DeliveryManifest | null,
  input?: {
    scope?: DeliveryManifestFieldScope;
    includeSecrets?: boolean;
  }
) {
  if (!manifest) {
    return [];
  }

  const includeSecrets = input?.includeSecrets ?? true;
  const items = includeSecrets
    ? [...manifest.envFields, ...manifest.secretFields]
    : [...manifest.envFields];

  if (!input?.scope) {
    return items;
  }

  return items.filter((item) => item.scope === input.scope);
}

export function findDeliveryManifestField(manifest: DeliveryManifest | null, key: string) {
  if (!manifest) {
    return null;
  }

  return [...manifest.envFields, ...manifest.secretFields].find((item) => item.key === key) ?? null;
}

export function getDeliveryManifestGroupMap(manifest: DeliveryManifest | null) {
  return new Map((manifest?.groups ?? []).map((group) => [group.key, group]));
}

export function listDeliveryManifestAssetRequiredSecretKeys(manifest: DeliveryManifest | null) {
  if (!manifest) {
    return [];
  }

  return [
    ...new Set(
      manifest.assets
        .filter((asset) => asset.required && asset.visibility === 'private' && Boolean(asset.authSecret))
        .map((asset) => asset.authSecret!)
    )
  ];
}
