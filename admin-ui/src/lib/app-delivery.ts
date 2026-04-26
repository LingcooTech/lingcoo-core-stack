import type { UpsertDeliverySettingsInput } from '@/api/delivery';
import type { DeliverySettingsOverview } from '@/api/types';

export type DeliveryMode = 'none' | 'one_click';
export type DeliveryManifestFieldScope = 'user_input' | 'preset';
export type DeliveryManifestFieldType = 'text' | 'email' | 'boolean' | 'secret';
export type DeliveryManifestDomainSourceField = string;

export interface DeliveryManifestSourceDraft {
  repoUrl: string;
  repoBranch: string;
  manifestPath: string;
  manifestUrl: string;
}

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
  defaultValue?: string | boolean;
}

export interface DeliveryManifest {
  version: string;
  installer: DeliveryManifestInstaller;
  groups: DeliveryManifestGroup[];
  domainSlots: DeliveryManifestDomainSlot[];
  envFields: DeliveryManifestField[];
  secretFields: DeliveryManifestField[];
  notes: string[];
}

export interface DeliverySettingsDraft {
  values: Record<string, string | boolean>;
  secrets: Record<string, string>;
}

export type DeliverySecretState = Record<string, boolean>;

export const EMPTY_DELIVERY_SETTINGS_DRAFT: DeliverySettingsDraft = {
  values: {},
  secrets: {},
};

export const EMPTY_DELIVERY_SECRET_STATE: DeliverySecretState = {};

export const DEFAULT_DELIVERY_MANIFEST_SOURCE_DRAFT: DeliveryManifestSourceDraft = {
  repoUrl: '',
  repoBranch: 'main',
  manifestPath: 'fd-delivery.manifest.json',
  manifestUrl: '',
};

function normalizeMeta(meta: unknown) {
  return meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {};
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

function normalizeScope(value: unknown): DeliveryManifestFieldScope {
  return normalizeString(value) === 'preset' ? 'preset' : 'user_input';
}

function normalizeFieldType(
  value: unknown,
  fallback: DeliveryManifestFieldType,
): DeliveryManifestFieldType {
  const normalized = normalizeString(value);
  if (
    normalized === 'text' ||
    normalized === 'email' ||
    normalized === 'boolean' ||
    normalized === 'secret'
  ) {
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
  fallbackType: DeliveryManifestFieldType,
): DeliveryManifestField | null {
  const raw = normalizeMeta(value);
  const key = normalizeString(raw.key);
  const label = normalizeString(raw.label);

  if (!key || !label) {
    return null;
  }

  const type = normalizeFieldType(raw.type, fallbackType);

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
    defaultValue: normalizeFieldDefaultValue(type, raw.defaultValue),
  };
}

function normalizeDomainSlot(value: unknown): DeliveryManifestDomainSlot | null {
  const raw = normalizeMeta(value);
  const key = normalizeString(raw.key);
  const label = normalizeString(raw.label);
  const envKey = normalizeString(raw.envKey);

  if (!key || !label || !envKey) {
    return null;
  }

  const sourceField = normalizeString(raw.sourceField) || key;

  return {
    key,
    label,
    envKey,
    sourceField,
    required: normalizeBoolean(raw.required) ?? false,
    placeholder: normalizeString(raw.placeholder) || undefined,
    description: normalizeString(raw.description) || undefined,
  };
}

function normalizeGroup(value: unknown): DeliveryManifestGroup | null {
  const raw = normalizeMeta(value);
  const key = normalizeString(raw.key);
  const label = normalizeString(raw.label);
  if (!key || !label) {
    return null;
  }

  return {
    key,
    label,
    description: normalizeString(raw.description) || undefined,
  };
}

export function getAppDeliveryMode(input: {
  meta?: Record<string, unknown> | undefined;
}): DeliveryMode {
  const meta = normalizeMeta(input.meta);
  const rawMode = meta.deliveryMode;

  if (rawMode === 'none' || rawMode === 'one_click') {
    return rawMode;
  }

  return 'none';
}

export function getDeliveryManifest(
  input?: {
    meta?: Record<string, unknown> | undefined;
  } | null,
): DeliveryManifest | null {
  const meta = normalizeMeta(input?.meta);
  const raw = normalizeMeta(meta.deliveryManifest);
  if (Object.keys(raw).length === 0) {
    return null;
  }

  const installerRaw = normalizeMeta(raw.installer);

  return {
    version: normalizeString(raw.version) || '1',
    installer: {
      repoUrl: normalizeString(installerRaw.repoUrl),
      repoBranch: normalizeString(installerRaw.repoBranch) || 'main',
      remoteInstallScriptUrl: normalizeString(installerRaw.remoteInstallScriptUrl),
      installPath: normalizeString(installerRaw.installPath) || '/opt/fd-headless-wp-system',
    },
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
    notes: Array.isArray(raw.notes)
      ? raw.notes.map((item) => normalizeString(item)).filter((item) => item.length > 0)
      : [],
  };
}

export function getManifestFields(
  manifest: DeliveryManifest | null,
  scope?: DeliveryManifestFieldScope,
) {
  if (!manifest) {
    return [];
  }

  const items = [...manifest.envFields, ...manifest.secretFields];
  if (!scope) {
    return items;
  }

  return items.filter((item) => item.scope === scope);
}

export function getManifestFieldGroups(
  manifest: DeliveryManifest | null,
  scope: DeliveryManifestFieldScope,
) {
  const fields = getManifestFields(manifest, scope);
  const groups = new Map(manifest?.groups.map((group) => [group.key, group]) ?? []);
  const grouped = new Map<string, DeliveryManifestField[]>();

  for (const field of fields) {
    const groupKey = field.group ?? '__default__';
    const current = grouped.get(groupKey) ?? [];
    current.push(field);
    grouped.set(groupKey, current);
  }

  return [...grouped.entries()].map(([groupKey, groupFields]) => ({
    key: groupKey,
    label: groupKey === '__default__' ? '未分组字段' : groups.get(groupKey)?.label ?? groupKey,
    description: groupKey === '__default__' ? undefined : groups.get(groupKey)?.description,
    fields: groupFields,
  }));
}

function createDraftFromFields(
  fields: DeliveryManifestField[],
  values?: Record<string, string | boolean>,
) {
  const next: DeliverySettingsDraft = {
    values: {},
    secrets: {},
  };

  for (const field of fields) {
    if (field.type === 'secret') {
      continue;
    }

    if (typeof field.defaultValue !== 'undefined') {
      next.values[field.key] = field.defaultValue;
    }
  }

  for (const [key, value] of Object.entries(values ?? {})) {
    next.values[key] = value;
  }

  return next;
}

export function createDeliverySettingsDraft(
  overview?: DeliverySettingsOverview | null,
  manifest?: DeliveryManifest | null,
): DeliverySettingsDraft {
  return createDraftFromFields(getManifestFields(manifest ?? null, 'preset'), overview?.values);
}

export function createDeploymentInputDraft(manifest?: DeliveryManifest | null): DeliverySettingsDraft {
  return createDraftFromFields(getManifestFields(manifest ?? null, 'user_input'));
}

export function createDeliverySecretState(
  overview?: DeliverySettingsOverview | null,
  manifest?: DeliveryManifest | null,
): DeliverySecretState {
  const next: DeliverySecretState = {};

  for (const field of getManifestFields(manifest ?? null, 'preset').filter((item) => item.type === 'secret')) {
    next[field.key] = overview?.secrets[field.key]?.configured ?? false;
  }

  for (const [key, status] of Object.entries(overview?.secrets ?? {})) {
    next[key] = status.configured;
  }

  return next;
}

export function createDeploymentSecretDraft(manifest?: DeliveryManifest | null) {
  const next: Record<string, string> = {};

  for (const field of getManifestFields(manifest ?? null, 'user_input').filter((item) => item.type === 'secret')) {
    next[field.key] = '';
  }

  return next;
}

export function createDeliveryManifestSourceDraft(input?: {
  meta?: Record<string, unknown> | undefined;
} | null): DeliveryManifestSourceDraft {
  const meta = normalizeMeta(input?.meta);
  const source = normalizeMeta(meta.deliveryManifestSource);

  return {
    repoUrl: typeof source.repoUrl === 'string' ? source.repoUrl : '',
    repoBranch:
      typeof source.repoBranch === 'string' && source.repoBranch.trim()
        ? source.repoBranch
        : DEFAULT_DELIVERY_MANIFEST_SOURCE_DRAFT.repoBranch,
    manifestPath:
      typeof source.manifestPath === 'string' && source.manifestPath.trim()
        ? source.manifestPath
        : DEFAULT_DELIVERY_MANIFEST_SOURCE_DRAFT.manifestPath,
    manifestUrl: typeof source.manifestUrl === 'string' ? source.manifestUrl : '',
  };
}

export function buildDeliveryManifestSourcePayload(draft: DeliveryManifestSourceDraft) {
  const repoUrl = draft.repoUrl.trim();
  const repoBranch = draft.repoBranch.trim() || DEFAULT_DELIVERY_MANIFEST_SOURCE_DRAFT.repoBranch;
  const manifestPath =
    draft.manifestPath.trim() || DEFAULT_DELIVERY_MANIFEST_SOURCE_DRAFT.manifestPath;
  const manifestUrl = draft.manifestUrl.trim();

  if (!repoUrl && !manifestUrl) {
    return {};
  }

  const payload: {
    repoUrl?: string;
    repoBranch?: string;
    manifestPath?: string;
    manifestUrl?: string;
  } = {
    repoBranch,
    manifestPath,
  };

  if (repoUrl) {
    payload.repoUrl = repoUrl;
  }

  if (manifestUrl) {
    payload.manifestUrl = manifestUrl;
  }

  return payload;
}

export function serializeDeliveryManifestSourceDraft(draft: DeliveryManifestSourceDraft) {
  return JSON.stringify({
    repoUrl: draft.repoUrl.trim(),
    repoBranch: draft.repoBranch.trim() || DEFAULT_DELIVERY_MANIFEST_SOURCE_DRAFT.repoBranch,
    manifestPath:
      draft.manifestPath.trim() || DEFAULT_DELIVERY_MANIFEST_SOURCE_DRAFT.manifestPath,
    manifestUrl: draft.manifestUrl.trim(),
  });
}

export function computeDeliveryConfigured(
  manifest: DeliveryManifest | null,
  draft: DeliverySettingsDraft,
  secrets: DeliverySecretState,
) {
  const fields = getManifestFields(manifest, 'preset');
  if (fields.length === 0) {
    return Object.keys(draft.values).length > 0 || Object.keys(secrets).length > 0;
  }

  return fields.every((field) => {
    if (!field.required) {
      return true;
    }

    if (field.type === 'secret') {
      return Boolean(secrets[field.key]);
    }

    const value = draft.values[field.key];
    if (typeof value === 'boolean') {
      return true;
    }

    return typeof value === 'string' && value.trim().length > 0;
  });
}

export function serializeDeliverySettingsDraft(
  mode: DeliveryMode,
  draft: DeliverySettingsDraft,
  secrets: DeliverySecretState,
) {
  if (mode !== 'one_click') {
    return null;
  }

  return {
    values: draft.values,
    secretsConfigured: secrets,
  };
}

export function buildManifestInputPayload(
  draft: DeliverySettingsDraft,
) {
  const values: Record<string, string | boolean> = {};
  const secrets: Record<string, string> = {};

  for (const [key, value] of Object.entries(draft.values)) {
    if (typeof value === 'boolean') {
      values[key] = value;
      continue;
    }

    const normalized = value.trim();
    if (normalized) {
      values[key] = normalized;
    }
  }

  for (const [key, value] of Object.entries(draft.secrets)) {
    const normalized = value.trim();
    if (normalized) {
      secrets[key] = normalized;
    }
  }

  return { values, secrets };
}

export function buildDeliverySettingsPayload(
  draft: DeliverySettingsDraft,
): UpsertDeliverySettingsInput {
  return buildManifestInputPayload(draft);
}
