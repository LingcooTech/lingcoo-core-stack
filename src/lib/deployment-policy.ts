export type DeploymentDomainBindingSource = string;
export type DeploymentDomainBindingMode = 'none' | 'lock_on_first_success';
export type DeploymentDomainBindingScope = 'exact_host' | 'registrable_domain';

export interface DeploymentPolicy {
  maxActiveDeployments: number;
  domainBindingMode: DeploymentDomainBindingMode;
  domainBindingSource: DeploymentDomainBindingSource;
  domainBindingScope: DeploymentDomainBindingScope;
  allowMultiplePurchases: boolean;
}

export const DEFAULT_DEPLOYMENT_POLICY: DeploymentPolicy = {
  maxActiveDeployments: 1,
  domainBindingMode: 'none',
  domainBindingSource: 'none',
  domainBindingScope: 'registrable_domain',
  allowMultiplePurchases: false,
};

const COMPOUND_PUBLIC_SUFFIXES = new Set([
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'co.uk',
  'org.uk',
  'ac.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.jp',
  'com.br',
]);

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeHostname(value: unknown) {
  return typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/^(https?|wss?):\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/\.+$/, '')
    : '';
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
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return undefined;
}

function normalizeMax(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 1
    ? Math.floor(parsed)
    : DEFAULT_DEPLOYMENT_POLICY.maxActiveDeployments;
}

function normalizeBindingSource(value: unknown): DeploymentDomainBindingSource {
  const normalized = normalizeString(value);
  return normalized && normalized !== 'none' ? normalized : 'none';
}

function normalizeBindingMode(
  value: unknown,
  source: DeploymentDomainBindingSource,
): DeploymentDomainBindingMode {
  const normalized = normalizeString(value);
  if (normalized === 'lock_on_first_success' && source !== 'none') {
    return 'lock_on_first_success';
  }
  return 'none';
}

function normalizeBindingScope(value: unknown): DeploymentDomainBindingScope {
  return normalizeString(value) === 'exact_host' ? 'exact_host' : 'registrable_domain';
}

export function normalizeDeploymentPolicy(value: unknown): DeploymentPolicy {
  const raw = normalizeObject(value);
  const source = normalizeBindingSource(raw.domainBindingSource);
  const mode = normalizeBindingMode(raw.domainBindingMode, source);
  return {
    maxActiveDeployments: normalizeMax(raw.maxActiveDeployments),
    domainBindingMode: mode,
    domainBindingSource: mode === 'none' ? 'none' : source,
    domainBindingScope: normalizeBindingScope(raw.domainBindingScope),
    allowMultiplePurchases:
      normalizeBoolean(raw.allowMultiplePurchases) ??
      DEFAULT_DEPLOYMENT_POLICY.allowMultiplePurchases,
  };
}

export function getRegistrableDomain(hostname: string) {
  const normalized = normalizeHostname(hostname);
  const labels = normalized.split('.').filter(Boolean);
  if (labels.length <= 2) {
    return normalized;
  }
  const suffix = labels.slice(-2).join('.');
  if (COMPOUND_PUBLIC_SUFFIXES.has(suffix) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }
  return labels.slice(-2).join('.');
}

export function getDomainBindingValue(hostname: unknown, scope: DeploymentDomainBindingScope) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) {
    return '';
  }
  return scope === 'exact_host' ? normalized : getRegistrableDomain(normalized);
}
