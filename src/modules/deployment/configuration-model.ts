import { type DeliveryManifestDomainSourceField } from '../../lib/delivery-manifest';
import { type DeliverySettingSecrets, type DeliverySettingValues } from './public';
import { type AppServicePort as AppService } from '../app/public';

export type DeploymentAppRecord = Awaited<ReturnType<AppService['getPublicApp']>>;

export type DeploymentStatusReportPayload = {
  deploymentId: string;
  token: string;
  runtimeHealth?: 'ready' | 'unhealthy';
  runtimeAssets?: {
    current?: Record<string, string | null>;
    available?: Record<string, string | null>;
    offeredAt?: string | null;
    appliedAt?: string | null;
  };
};

export type DeploymentActionKind = 'apply_runtime_images' | 'ignore_runtime_images';

export function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeBoolean(value: unknown) {
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

export function normalizeValueRecord(value: unknown) {
  const raw = normalizeObject(value);
  const result: DeliverySettingValues = {};

  for (const [key, entry] of Object.entries(raw)) {
    if (typeof entry === 'boolean') {
      result[key] = entry;
      continue;
    }

    const booleanValue = normalizeBoolean(entry);
    const stringValue = normalizeString(entry);
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

export function normalizeSecretRecord(value: unknown) {
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

export function normalizeDomainValueRecord(value: unknown) {
  const raw = normalizeObject(value);
  const result: Record<string, string> = {};

  for (const [key, entry] of Object.entries(raw)) {
    const normalizedKey = normalizeString(key);
    const normalizedValue = normalizeHostname(entry);
    if (normalizedKey && normalizedValue) {
      result[normalizedKey] = normalizedValue;
    }
  }

  return result;
}

export type DeploymentDomainBindingSource = string;

export type DeploymentRuntimeUpdatePolicy = 'manual' | 'auto';

export type DeploymentBindingState = {
  sourceField: DeploymentDomainBindingSource;
  scope?: 'exact_host' | 'registrable_domain';
  boundDomain: string | null;
  boundAt: string | null;
};

export type DeploymentConfigIssue = {
  kind: 'domain_slot' | 'user_input';
  key: string;
  label: string;
  fieldType?: 'text' | 'secret' | 'boolean';
  sourceField?: DeliveryManifestDomainSourceField;
};

export function normalizeHostname(value: unknown) {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/^(https?|wss?):\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.+$/, '');

  return normalized;
}

export function isDeploymentDomainBindingSource(
  value: string,
): value is DeliveryManifestDomainSourceField {
  return value.length > 0 && value !== 'none';
}

export function getDomainBindingSourceLabel(sourceField: DeploymentDomainBindingSource) {
  if (sourceField === 'none') {
    return '域名';
  }

  return sourceField;
}

export function normalizeDeploymentRuntimeUpdatePolicy(
  value: unknown,
): DeploymentRuntimeUpdatePolicy {
  return normalizeString(value) === 'auto' ? 'auto' : 'manual';
}
