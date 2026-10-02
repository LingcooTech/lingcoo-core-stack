import { type DeliveryManifestDomainSourceField } from '../../lib/delivery-manifest';
import { type DeliverySettingSecrets, type DeliverySettingValues } from './public';
import { type AppServicePort as AppService } from '../app/public';

export type DeploymentAppRecord = Awaited<ReturnType<AppService['getPublicApp']>>;

export const DEFAULT_INSTALLER = {
  repoUrl: 'https://github.com/FutureDecade/fd-headless-wp-system.git',
  repoBranch: 'main',
  remoteInstallScriptUrl:
    'https://raw.githubusercontent.com/FutureDecade/fd-headless-wp-system/main/scripts/remote-install.sh',
  installPath: '/opt/fd-headless-wp-system',
};

export const LEGACY_APP_DEFAULT_VALUE_KEYS: Record<
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
  wpgraphqlTaxQueryRef: { envKey: 'WPGRAPHQL_TAX_QUERY_REF', kind: 'string' },
};

export const WORDPRESS_ASSET_RELEASE_KEYS = [
  'FD_THEME_RELEASE_TAG',
  'FD_PAGE_COMPOSER_RELEASE_TAG',
  'FD_ADMIN_UI_RELEASE_TAG',
  'FD_MEMBER_RELEASE_TAG',
  'FD_PAYMENT_RELEASE_TAG',
  'FD_COMMERCE_RELEASE_TAG',
  'FD_CONTENT_TYPES_RELEASE_TAG',
  'FD_FORMS_RELEASE_TAG',
  'FD_AI_ROUTER_RELEASE_TAG',
  'FD_WEBSOCKET_PUSH_RELEASE_TAG',
  'WPGRAPHQL_RELEASE_TAG',
  'WPGRAPHQL_JWT_AUTH_RELEASE_TAG',
  'WPGRAPHQL_TAX_QUERY_REF',
] as const;

export const AVAILABLE_WORDPRESS_ASSET_RELEASE_KEYS = [
  'AVAILABLE_FD_THEME_RELEASE_TAG',
  'AVAILABLE_FD_PAGE_COMPOSER_RELEASE_TAG',
  'AVAILABLE_FD_ADMIN_UI_RELEASE_TAG',
  'AVAILABLE_FD_MEMBER_RELEASE_TAG',
  'AVAILABLE_FD_PAYMENT_RELEASE_TAG',
  'AVAILABLE_FD_COMMERCE_RELEASE_TAG',
  'AVAILABLE_FD_CONTENT_TYPES_RELEASE_TAG',
  'AVAILABLE_FD_FORMS_RELEASE_TAG',
  'AVAILABLE_FD_AI_ROUTER_RELEASE_TAG',
  'AVAILABLE_FD_WEBSOCKET_PUSH_RELEASE_TAG',
  'AVAILABLE_WPGRAPHQL_RELEASE_TAG',
  'AVAILABLE_WPGRAPHQL_JWT_AUTH_RELEASE_TAG',
  'AVAILABLE_WPGRAPHQL_TAX_QUERY_REF',
] as const;

export type DeploymentStatusReportPayload = {
  deploymentId: string;
  token: string;
  runtimeAssets?: {
    current?: Record<string, string | null>;
    available?: Record<string, string | null>;
    offeredAt?: string | null;
    appliedAt?: string | null;
  };
  runtimeImages?: {
    currentFrontendImage?: string | null;
    currentWebsocketImage?: string | null;
    availableFrontendImage?: string | null;
    availableWebsocketImage?: string | null;
    offeredAt?: string | null;
    appliedAt?: string | null;
  };
  wordpressAssets?: {
    current?: Record<string, string | null>;
    available?: Record<string, string | null>;
    offeredAt?: string | null;
    appliedAt?: string | null;
  };
};

export type DeploymentActionKind =
  | 'apply_runtime_images'
  | 'apply_wordpress_assets'
  | 'ignore_runtime_images'
  | 'ignore_wordpress_assets';

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
