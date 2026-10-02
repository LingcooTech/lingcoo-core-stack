import type { ServiceFactories } from '../../composition/service-factories';
import { randomBytes } from 'node:crypto';

import type { DbExecutor } from '../../db/types';
import {
  findDeliveryManifestField,
  listDeliveryManifestFields,
  normalizeDeliveryManifest,
  type DeliveryManifest,
  type DeliveryManifestDomainSourceField,
  type DeliveryManifestField,
} from '../../lib/delivery-manifest';
import {
  DeliverySettingsService,
  type DeliverySettingSecrets,
  type DeliverySettingValues,
} from '../../lib/delivery-settings';
import {
  getDomainBindingValue,
  normalizeDeploymentPolicy,
  type DeploymentPolicy,
} from '../../lib/deployment-policy';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';

import { decryptJson, encryptJson, getEncryptionKeys } from '../../lib/settings-crypto';
import { createAppAccess } from '../app/public';
import { type AppServicePort as AppService } from '../app/public';
import { createAuthAccess } from '../auth/public';

import { type LicenseRepositoryPort as LicenseRepository } from '../license/public';
import { DeploymentRepository } from './repository';

type DeploymentAppRecord = Awaited<ReturnType<AppService['getPublicApp']>>;

const DEFAULT_INSTALLER = {
  repoUrl: 'https://github.com/FutureDecade/fd-headless-wp-system.git',
  repoBranch: 'main',
  remoteInstallScriptUrl:
    'https://raw.githubusercontent.com/FutureDecade/fd-headless-wp-system/main/scripts/remote-install.sh',
  installPath: '/opt/fd-headless-wp-system',
};

const LEGACY_APP_DEFAULT_VALUE_KEYS: Record<
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

const WORDPRESS_ASSET_RELEASE_KEYS = [
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

const AVAILABLE_WORDPRESS_ASSET_RELEASE_KEYS = [
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

type DeploymentStatusReportPayload = {
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

type DeploymentActionKind =
  | 'apply_runtime_images'
  | 'apply_wordpress_assets'
  | 'ignore_runtime_images'
  | 'ignore_wordpress_assets';

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

function normalizeValueRecord(value: unknown) {
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

function normalizeDomainValueRecord(value: unknown) {
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

type DeploymentDomainBindingSource = string;
type DeploymentRuntimeUpdatePolicy = 'manual' | 'auto';

type DeploymentBindingState = {
  sourceField: DeploymentDomainBindingSource;
  scope?: 'exact_host' | 'registrable_domain';
  boundDomain: string | null;
  boundAt: string | null;
};

type DeploymentConfigIssue = {
  kind: 'domain_slot' | 'user_input';
  key: string;
  label: string;
  fieldType?: 'text' | 'secret' | 'boolean';
  sourceField?: DeliveryManifestDomainSourceField;
};

function normalizeHostname(value: unknown) {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/^(https?|wss?):\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.+$/, '');

  return normalized;
}

function isDeploymentDomainBindingSource(
  value: string,
): value is DeliveryManifestDomainSourceField {
  return value.length > 0 && value !== 'none';
}

function getDomainBindingSourceLabel(sourceField: DeploymentDomainBindingSource) {
  if (sourceField === 'none') {
    return '域名';
  }

  return sourceField;
}

function normalizeDeploymentRuntimeUpdatePolicy(value: unknown): DeploymentRuntimeUpdatePolicy {
  return normalizeString(value) === 'auto' ? 'auto' : 'manual';
}

export {
  DEFAULT_INSTALLER,
  AVAILABLE_WORDPRESS_ASSET_RELEASE_KEYS,
  DeploymentStatusReportPayload,
  DeploymentActionKind,
  normalizeString,
  normalizeValueRecord,
  normalizeSecretRecord,
  normalizeDomainValueRecord,
  DeploymentRuntimeUpdatePolicy,
  normalizeDeploymentRuntimeUpdatePolicy,
};

export class DeploymentConfigurationUseCases {
  constructor(
    protected readonly capabilities: ServiceFactories,
    protected readonly db: DbExecutor,
    protected readonly env: AppEnv,
  ) {}
  protected getEncryptionSecret() {
    return getEncryptionKeys(this.env);
  }

  protected async resolveDeployableApp(input: { userId: string; appCode: string }) {
    const app = await this.capabilities.createAppService(this.db).getPublicApp(input.appCode);

    if (this.readDeliveryMode(app) !== 'one_click') {
      throw httpError(422, 'This app is not configured for one-click delivery');
    }

    const entitlementView = await this.capabilities
      .createAppService(this.db)
      .listUserEntitlementsForApp(input.appCode, input.userId);

    if (entitlementView.summary.length === 0) {
      throw httpError(403, 'You do not have an active deployment entitlement for this app');
    }

    return {
      app,
      entitlementSummary: entitlementView.summary,
    };
  }

  protected isEffectiveEntitlement(entitlement: { status: string; expiresAt: Date | null }) {
    return (
      entitlement.status === 'active' &&
      (!entitlement.expiresAt || entitlement.expiresAt.getTime() >= Date.now())
    );
  }

  protected async resolveDeploymentEntitlement(input: {
    userId: string;
    appId: string;
    entitlementId: string;
  }) {
    const repository = this.capabilities.createLicenseAccess(this.db);

    const entitlement = await repository.findEntitlementById(input.entitlementId);
    if (
      !entitlement ||
      entitlement.userId !== input.userId ||
      entitlement.appId !== input.appId ||
      !this.isEffectiveEntitlement(entitlement)
    ) {
      throw httpError(403, 'Selected entitlement is not active for this app');
    }
    const plan = await repository.getPlanById(entitlement.planId);
    if (!plan) {
      throw httpError(500, 'Selected entitlement is missing related plan');
    }
    return { entitlement, plan };
  }

  protected async loadDeploymentEntitlement(
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>,
  ) {
    if (!deployment?.entitlementId) {
      throw httpError(
        409,
        'Deployment is not bound to an entitlement. Create a new deployment with an active entitlement.',
      );
    }

    const entitlement = await this.capabilities
      .createLicenseAccess(this.db)
      .findEntitlementById(deployment.entitlementId);
    if (
      !entitlement ||
      entitlement.userId !== deployment.userId ||
      entitlement.appId !== deployment.appId
    ) {
      throw httpError(
        409,
        'Deployment entitlement is missing or no longer matches this deployment.',
      );
    }
    if (!this.isEffectiveEntitlement(entitlement)) {
      throw httpError(
        403,
        'Deployment entitlement is not active. Restore access before continuing.',
      );
    }
    const plan = await this.capabilities
      .createLicenseAccess(this.db)
      .getPlanById(entitlement.planId);
    if (!plan) {
      throw httpError(500, 'Deployment entitlement is missing related plan');
    }

    return { entitlement, plan };
  }

  protected async hydrateDeployments(
    rows: Awaited<ReturnType<DeploymentRepository['listDeploymentsByUserId']>>,
  ) {
    const appIds = [...new Set(rows.map((item) => item.appId))];
    const userIds = [...new Set(rows.map((item) => item.userId))];
    const entitlementIds = [
      ...new Set(
        rows.map((item) => item.entitlementId).filter((item): item is string => Boolean(item)),
      ),
    ];
    const [apps, users, tokens, entitlements] = await Promise.all([
      createAppAccess(this.db).listAppsByIds(appIds),
      createAuthAccess(this.db).listUsersByIds(userIds),
      new DeploymentRepository(this.db).listTokensByDeploymentIds(rows.map((item) => item.id)),
      this.capabilities.createLicenseAccess(this.db).listEntitlementsByIds(entitlementIds),
    ]);

    const appMap = new Map(apps.map((item) => [item.id, item]));
    const userMap = new Map(users.map((item) => [item.id, item]));
    const entitlementMap = new Map(entitlements.map((item) => [item.id, item]));
    const planIds = [...new Set(entitlements.map((item) => item.planId))];
    const plans = await this.capabilities.createLicenseAccess(this.db).listPlansByIds(planIds);
    const planMap = new Map(plans.map((item) => [item.id, item]));
    const latestTokenMap = new Map<string, (typeof tokens)[number]>();
    for (const token of tokens) {
      if (!latestTokenMap.has(token.deploymentId)) {
        latestTokenMap.set(token.deploymentId, token);
      }
    }

    return Promise.all(
      rows.map(async (row) => {
        const app = appMap.get(row.appId) ?? null;
        const user = userMap.get(row.userId) ?? null;
        const token = latestTokenMap.get(row.id) ?? null;
        const entitlement = row.entitlementId
          ? (entitlementMap.get(row.entitlementId) ?? null)
          : null;
        const plan = entitlement ? (planMap.get(entitlement.planId) ?? null) : null;
        const manifest = app ? this.readManifest(app as DeploymentAppRecord) : null;
        const deliveryValues = this.readDeploymentInputValues(row);
        const domainValues = this.filterDomainValuesForManifest(
          manifest,
          this.readDeploymentDomainValues(row),
        );
        const configuredSecretKeys = Object.keys(this.readDeploymentInputSecrets(row));
        const updatePolicy = this.readDeploymentRuntimeUpdatePolicy(row);
        const meta = this.normalizeMeta(row.meta);
        const runtimeUpdateMeta = this.normalizeMeta(meta.runtimeUpdate);
        const runtimeAssetsMeta = this.normalizeMeta(meta.runtimeAssetsUpdate);
        const wordpressAssetsMeta = this.normalizeMeta(meta.wordpressAssetsUpdate);
        const policy = entitlement ? this.readEntitlementDeploymentPolicy(entitlement) : null;
        const binding = this.readEntitlementBinding(entitlement);
        const activeBindingSource =
          policy?.domainBindingMode === 'lock_on_first_success'
            ? policy.domainBindingSource
            : 'none';
        const currentBoundValue =
          activeBindingSource === 'none'
            ? null
            : getDomainBindingValue(
                this.getSourceFieldValue(row, activeBindingSource),
                policy?.domainBindingScope ?? 'registrable_domain',
              ) || null;
        const isDomainLocked =
          activeBindingSource !== 'none' &&
          Boolean(binding.boundDomain) &&
          currentBoundValue === binding.boundDomain;
        const envDefaults = this.buildDeploymentDisplayEnvDefaults({
          app: app ? (app as DeploymentAppRecord) : null,
          deploymentValues: deliveryValues,
        });
        const reportedCurrentRuntimeImages = {
          frontendImage: normalizeString(runtimeUpdateMeta.currentFrontendImage) || null,
          websocketImage: normalizeString(runtimeUpdateMeta.currentWebsocketImage) || null,
        };
        const currentRuntimeImages = {
          frontendImage:
            reportedCurrentRuntimeImages.frontendImage ||
            normalizeString(envDefaults.FRONTEND_IMAGE) ||
            null,
          websocketImage:
            reportedCurrentRuntimeImages.websocketImage ||
            normalizeString(envDefaults.WEBSOCKET_IMAGE) ||
            null,
        };
        const availableRuntimeImages = {
          frontendImage: normalizeString(runtimeUpdateMeta.availableFrontendImage) || null,
          websocketImage: normalizeString(runtimeUpdateMeta.availableWebsocketImage) || null,
          offeredAt: normalizeString(runtimeUpdateMeta.offeredAt) || null,
          appliedAt: normalizeString(runtimeUpdateMeta.appliedAt) || null,
        };
        const reportedCurrentRuntimeAssets = this.normalizeMeta(runtimeAssetsMeta.current);
        const reportedAvailableRuntimeAssets = this.normalizeMeta(runtimeAssetsMeta.available);
        const runtimeAssetLabels = new Map(
          (manifest?.assets ?? [])
            .filter((asset) => asset.type === 'docker_image')
            .map((asset) => [asset.key, asset.label]),
        );
        const runtimeAssetKeys = [
          ...new Set([
            ...Object.keys(reportedCurrentRuntimeAssets),
            ...Object.keys(reportedAvailableRuntimeAssets),
          ]),
        ];
        const runtimeAssets = runtimeAssetKeys.map((key) => ({
          key,
          label: runtimeAssetLabels.get(key) ?? key,
          current: normalizeString(reportedCurrentRuntimeAssets[key]) || null,
          available: normalizeString(reportedAvailableRuntimeAssets[key]) || null,
        }));
        const currentWordpressAssetReleases = Object.fromEntries(
          WORDPRESS_ASSET_RELEASE_KEYS.map((key) => [
            key,
            normalizeString(this.normalizeMeta(wordpressAssetsMeta.current)[key]) ||
              normalizeString(envDefaults[key]) ||
              null,
          ]),
        ) as Record<(typeof WORDPRESS_ASSET_RELEASE_KEYS)[number], string | null>;
        const availableWordpressAssetReleases = Object.fromEntries(
          AVAILABLE_WORDPRESS_ASSET_RELEASE_KEYS.map((key) => [
            key,
            normalizeString(this.normalizeMeta(wordpressAssetsMeta.available)[key]) ||
              normalizeString(wordpressAssetsMeta[key]) ||
              null,
          ]),
        ) as Record<(typeof AVAILABLE_WORDPRESS_ASSET_RELEASE_KEYS)[number], string | null>;
        const pendingAction = this.normalizeMeta(meta.pendingAction);
        const lastAction = this.normalizeMeta(meta.lastAction);

        return {
          ...row,
          deliveryValues,
          domainValues,
          configuredSecretKeys,
          updatePolicy,
          currentRuntimeImages,
          availableRuntimeImages,
          runtimeAssets,
          runtimeAssetsOfferedAt: normalizeString(runtimeAssetsMeta.offeredAt) || null,
          runtimeAssetsAppliedAt: normalizeString(runtimeAssetsMeta.appliedAt) || null,
          currentWordpressAssetReleases,
          availableWordpressAssetReleases,
          pendingAction:
            normalizeString(pendingAction.id).length > 0
              ? {
                  id: normalizeString(pendingAction.id),
                  kind: normalizeString(pendingAction.kind) as DeploymentActionKind,
                  requestedAt: normalizeString(pendingAction.requestedAt) || null,
                }
              : null,
          lastAction:
            normalizeString(lastAction.id).length > 0
              ? {
                  id: normalizeString(lastAction.id),
                  kind: normalizeString(lastAction.kind) as DeploymentActionKind,
                  status: normalizeString(lastAction.status) || 'completed',
                  message: normalizeString(lastAction.message) || null,
                  finishedAt: normalizeString(lastAction.finishedAt) || null,
                }
              : null,
          domainBinding: {
            sourceField: activeBindingSource,
            sourceLabel:
              activeBindingSource === 'none'
                ? null
                : (manifest?.domainSlots.find((slot) => slot.sourceField === activeBindingSource)
                    ?.label ?? activeBindingSource),
            isLocked: isDomainLocked,
            boundDomain: binding.boundDomain,
            boundAt: binding.boundAt,
            scope: binding.scope ?? policy?.domainBindingScope ?? 'registrable_domain',
          },
          entitlement: entitlement
            ? {
                id: entitlement.id,
                status: entitlement.status,
                startsAt: entitlement.startsAt,
                expiresAt: entitlement.expiresAt,
                plan: plan
                  ? {
                      id: plan.id,
                      code: plan.code,
                      name: plan.name,
                      interval: plan.interval,
                    }
                  : null,
              }
            : null,
          user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
          app: app ? { id: app.id, code: app.code, name: app.name, type: app.type } : null,
          latestToken: token
            ? {
                id: token.id,
                tokenHint: token.tokenHint,
                status: token.status,
                expiresAt: token.expiresAt,
                usedAt: token.usedAt,
                createdAt: token.createdAt,
              }
            : null,
        };
      }),
    );
  }

  protected createPlainToken() {
    return `fddp_${randomBytes(24).toString('base64url')}`;
  }

  protected createStatusReportToken() {
    return `fdsr_${randomBytes(24).toString('base64url')}`;
  }

  protected normalizeMeta(meta: unknown) {
    return meta && typeof meta === 'object' && !Array.isArray(meta)
      ? { ...(meta as Record<string, unknown>) }
      : {};
  }

  protected async ensureDeploymentStatusReportAuth(
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>,
  ) {
    const meta = this.normalizeMeta(deployment?.meta);
    const runtimeStatusReport = this.normalizeMeta(meta.runtimeStatusReport);
    let token = '';

    if (runtimeStatusReport.token) {
      try {
        const decrypted = decryptJson<{ token?: string }>(
          runtimeStatusReport.token,
          this.getEncryptionSecret(),
        );
        token = normalizeString(decrypted.token);
      } catch {
        token = '';
      }
    }

    if (token.length > 0) {
      return {
        deployment,
        token,
      };
    }

    token = this.createStatusReportToken();
    meta.runtimeStatusReport = {
      tokenHint: token.slice(-8),
      token: encryptJson({ token }, this.getEncryptionSecret()),
      updatedAt: this.capabilities.now().toISOString(),
    };

    const updated = await new DeploymentRepository(this.db).updateDeployment(deployment.id, {
      meta,
    });

    return {
      deployment: updated ?? deployment,
      token,
    };
  }

  protected readDeliveryMode(app: DeploymentAppRecord) {
    const meta = this.normalizeMeta(app.meta);
    const rawMode = meta.deliveryMode;

    if (rawMode === 'none' || rawMode === 'one_click') {
      return rawMode;
    }

    return 'none';
  }

  protected readManifest(app: DeploymentAppRecord) {
    const meta = this.normalizeMeta(app.meta);
    return normalizeDeliveryManifest(meta.deliveryManifest);
  }

  protected readLegacyDeploymentDefaults(app: DeploymentAppRecord) {
    const meta = this.normalizeMeta(app.meta);
    const raw = this.normalizeMeta(meta.deploymentDefaults);
    const values: DeliverySettingValues = {};

    for (const [legacyKey, config] of Object.entries(LEGACY_APP_DEFAULT_VALUE_KEYS)) {
      const entry = raw[legacyKey];
      if (config.kind === 'boolean') {
        const normalized = normalizeBoolean(entry);
        if (typeof normalized === 'boolean') {
          values[config.envKey] = normalized;
        }
        continue;
      }

      const normalized = normalizeString(entry);
      if (normalized.length > 0) {
        values[config.envKey] = normalized;
      }
    }

    return {
      values,
      installer: {
        repoUrl: normalizeString(raw.repoUrl) || undefined,
        repoBranch: normalizeString(raw.repoBranch) || undefined,
      },
    };
  }

  protected buildDeploymentDisplayEnvDefaults(input: {
    app: DeploymentAppRecord | null;
    deploymentValues: DeliverySettingValues;
  }) {
    const values: DeliverySettingValues = {
      ...(input.app ? this.readLegacyDeploymentDefaults(input.app).values : {}),
      ...input.deploymentValues,
    };

    return Object.fromEntries(
      Object.entries(values)
        .map(([key, value]) => [
          key,
          typeof value === 'boolean' ? String(value) : normalizeString(value),
        ])
        .filter(([, value]) => value.length > 0),
    );
  }

  protected readEntitlementDeploymentPolicy(
    entitlement: { meta?: unknown } | null | undefined,
  ): DeploymentPolicy {
    const meta = this.normalizeMeta(entitlement?.meta);
    return normalizeDeploymentPolicy(meta.deploymentPolicy);
  }

  protected readEntitlementBinding(
    entitlement: { meta?: unknown } | null | undefined,
  ): DeploymentBindingState {
    const meta = this.normalizeMeta(entitlement?.meta);
    const binding = this.normalizeMeta(meta.domainBinding);
    const rawSourceField = normalizeString(binding.sourceField);
    const sourceField = isDeploymentDomainBindingSource(rawSourceField) ? rawSourceField : 'none';
    const boundDomain = normalizeHostname(binding.boundValue) || null;
    const boundAt = normalizeString(binding.boundAt) || null;
    const scope =
      normalizeString(binding.scope) === 'exact_host' ? 'exact_host' : 'registrable_domain';

    return {
      sourceField,
      scope,
      boundDomain,
      boundAt,
    };
  }

  protected async updateEntitlementBinding(input: {
    entitlementId: string;
    policy: DeploymentPolicy;
    boundValue: string;
  }) {
    const repository = this.capabilities.createLicenseAccess(this.db);
    const entitlement = await repository.findEntitlementById(input.entitlementId);
    if (!entitlement) {
      throw httpError(404, 'Entitlement not found');
    }
    const meta = this.normalizeMeta(entitlement.meta);
    meta.domainBinding = {
      mode: input.policy.domainBindingMode,
      sourceField: input.policy.domainBindingSource,
      scope: input.policy.domainBindingScope,
      boundValue: input.boundValue,
      boundAt: this.capabilities.now().toISOString(),
    };
    const updated = await repository.updateEntitlementMeta(input.entitlementId, meta);
    if (!updated) {
      throw httpError(500, 'Failed to bind entitlement domain');
    }
    return updated;
  }

  protected readDeploymentRuntimeUpdatePolicy(
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>,
  ): DeploymentRuntimeUpdatePolicy {
    const meta = this.normalizeMeta(deployment?.meta);
    const runtimeUpdate = this.normalizeMeta(meta.runtimeUpdate);
    return normalizeDeploymentRuntimeUpdatePolicy(runtimeUpdate.policy);
  }

  protected readDeploymentInputValues(
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>,
  ) {
    const meta = this.normalizeMeta(deployment?.meta);
    const inputs = this.normalizeMeta(meta.deliveryInputs);
    return normalizeValueRecord(inputs.values);
  }

  protected readDeploymentInputSecrets(
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>,
  ) {
    const meta = this.normalizeMeta(deployment?.meta);
    const inputs = this.normalizeMeta(meta.deliveryInputs);
    const secretEnvelope = inputs.secrets;
    if (!secretEnvelope) {
      return {} as DeliverySettingSecrets;
    }

    try {
      return normalizeSecretRecord(
        decryptJson<unknown>(secretEnvelope, this.getEncryptionSecret()),
      );
    } catch {
      return {};
    }
  }

  protected readDeploymentDomainValues(
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>,
  ) {
    const meta = this.normalizeMeta(deployment?.meta);
    const domains = this.normalizeMeta(meta.deliveryDomains);
    return normalizeDomainValueRecord(domains.values);
  }

  protected filterDomainValuesForManifest(
    manifest: DeliveryManifest | null,
    domainValues: Record<string, string>,
  ) {
    if (!manifest) {
      return {};
    }

    const allowedSourceFields = new Set(manifest.domainSlots.map((slot) => slot.sourceField));
    return Object.fromEntries(
      Object.entries(domainValues).filter(([key]) => allowedSourceFields.has(key)),
    );
  }

  protected collectDeploymentConfigIssues(input: {
    manifest: DeliveryManifest | null;
    values: DeliverySettingValues;
    secrets: DeliverySettingSecrets;
    domainValues: Record<string, string>;
    policy?: DeploymentPolicy;
  }) {
    const issues: DeploymentConfigIssue[] = [];

    if (!input.manifest) {
      return issues;
    }

    for (const slot of input.manifest.domainSlots) {
      const slotValue = input.domainValues[slot.sourceField];
      if (!slot.required || slotValue) {
        continue;
      }

      issues.push({
        kind: 'domain_slot',
        key: slot.key,
        label: slot.label,
        sourceField: slot.sourceField,
      });
    }

    if (
      input.policy?.domainBindingMode === 'lock_on_first_success' &&
      input.policy.domainBindingSource !== 'none'
    ) {
      const sourceField = input.policy.domainBindingSource;
      const alreadyTracked = issues.some(
        (issue) => issue.kind === 'domain_slot' && issue.sourceField === sourceField,
      );
      if (!alreadyTracked && !input.domainValues[sourceField]) {
        const slot = input.manifest.domainSlots.find((item) => item.sourceField === sourceField);
        issues.push({
          kind: 'domain_slot',
          key: slot?.key ?? sourceField,
          label: slot?.label ?? getDomainBindingSourceLabel(sourceField),
          sourceField,
        });
      }
    }

    for (const field of listDeliveryManifestFields(input.manifest, { scope: 'user_input' })) {
      if (!field.required) {
        continue;
      }

      if (field.type === 'secret') {
        if (!input.secrets[field.key]) {
          issues.push({
            kind: 'user_input',
            key: field.key,
            label: field.label,
            fieldType: 'secret',
          });
        }
        continue;
      }

      if (field.type === 'boolean') {
        if (
          typeof input.values[field.key] === 'undefined' &&
          typeof field.defaultValue !== 'boolean'
        ) {
          issues.push({
            kind: 'user_input',
            key: field.key,
            label: field.label,
            fieldType: 'boolean',
          });
        }
        continue;
      }

      const value = input.values[field.key];
      if (typeof value !== 'string' || value.trim().length === 0) {
        issues.push({
          kind: 'user_input',
          key: field.key,
          label: field.label,
          fieldType: 'text',
        });
      }
    }

    return issues;
  }

  protected createDomainBindingLockedError(binding: DeploymentBindingState) {
    return httpError(
      409,
      `${getDomainBindingSourceLabel(binding.sourceField)}已绑定到 ${binding.boundDomain}。如需更换，请提交工单处理。`,
      {
        code: 'deployment_domain_locked',
        boundSourceField: binding.sourceField,
        boundDomain: binding.boundDomain,
        boundAt: binding.boundAt,
      },
    );
  }

  protected assertDomainBindingEditable(input: {
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>;
    policy: DeploymentPolicy;
    binding: DeploymentBindingState;
    requestedDomainValues?: Record<string, string>;
  }) {
    const boundSourceField =
      input.policy.domainBindingMode === 'lock_on_first_success'
        ? input.policy.domainBindingSource
        : 'none';

    if (boundSourceField === 'none' || !input.binding.boundDomain) {
      return;
    }

    const requestedBySource: Record<string, string | undefined> = input.requestedDomainValues ?? {};
    const nextBoundValue =
      typeof requestedBySource[boundSourceField] === 'string'
        ? getDomainBindingValue(
            requestedBySource[boundSourceField] ?? '',
            input.policy.domainBindingScope,
          )
        : getDomainBindingValue(
            this.getSourceFieldValue(input.deployment, boundSourceField),
            input.policy.domainBindingScope,
          );

    if (nextBoundValue === input.binding.boundDomain) {
      return;
    }

    throw this.createDomainBindingLockedError(input.binding);
  }

  protected async ensureDeploymentReadyForTokenIssue(input: {
    app: DeploymentAppRecord;
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>;
  }) {
    const { entitlement } = await this.loadDeploymentEntitlement(input.deployment);
    const policy = this.readEntitlementDeploymentPolicy(entitlement);
    const binding = this.readEntitlementBinding(entitlement);
    const activeBindingSource =
      policy.domainBindingMode === 'lock_on_first_success' ? policy.domainBindingSource : 'none';
    const currentBoundValue =
      activeBindingSource === 'none'
        ? null
        : getDomainBindingValue(
            this.getSourceFieldValue(input.deployment, activeBindingSource),
            policy.domainBindingScope,
          );
    const issues = this.collectDeploymentConfigIssues({
      manifest: this.readManifest(input.app),
      values: this.readDeploymentInputValues(input.deployment),
      secrets: this.readDeploymentInputSecrets(input.deployment),
      domainValues: this.readDeploymentDomainValues(input.deployment),
      policy,
    });

    if (issues.length > 0) {
      throw httpError(
        409,
        'Deployment configuration is incomplete. Please edit the deployment and fill in the required fields before issuing a new token.',
        {
          code: 'deployment_config_incomplete',
          missingDomains: issues
            .filter((issue) => issue.kind === 'domain_slot')
            .map((issue) => ({
              key: issue.key,
              label: issue.label,
              sourceField: issue.sourceField,
            })),
          missingFields: issues
            .filter((issue) => issue.kind === 'user_input')
            .map((issue) => ({
              key: issue.key,
              label: issue.label,
              fieldType: issue.fieldType,
            })),
        },
      );
    }

    if (
      binding.boundDomain &&
      activeBindingSource !== 'none' &&
      currentBoundValue !== binding.boundDomain
    ) {
      throw this.createDomainBindingLockedError(binding);
    }
  }

  protected async bindDeploymentDomainOnExchange(input: {
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>;
    entitlementId: string;
    policy: DeploymentPolicy;
  }) {
    if (input.policy.domainBindingMode !== 'lock_on_first_success') {
      return input.deployment;
    }
    const sourceField = input.policy.domainBindingSource;
    if (sourceField === 'none') {
      return input.deployment;
    }

    const currentDomain = getDomainBindingValue(
      this.getSourceFieldValue(input.deployment, sourceField),
      input.policy.domainBindingScope,
    );
    if (!currentDomain) {
      throw httpError(409, `${getDomainBindingSourceLabel(sourceField)}不能为空，部署无法继续。`);
    }

    const entitlement = await this.capabilities
      .createLicenseAccess(this.db)
      .findEntitlementById(input.entitlementId);
    const binding = this.readEntitlementBinding(entitlement);
    if (binding.boundDomain && binding.boundDomain !== currentDomain) {
      throw this.createDomainBindingLockedError(binding);
    }

    if (binding.boundDomain) {
      return input.deployment;
    }

    await this.updateEntitlementBinding({
      entitlementId: input.entitlementId,
      policy: input.policy,
      boundValue: currentDomain,
    });

    return input.deployment;
  }

  protected buildRemoteInstallCommand(input: {
    token: string;
    exchangeUrl: string;
    remoteInstallScriptUrl?: string;
    installPath?: string | null;
    repoUrl?: string;
    repoBranch?: string;
  }) {
    const commandParts = [
      `FD_STACK_DEPLOY_TOKEN='${input.token}'`,
      `FD_STACK_EXCHANGE_URL='${input.exchangeUrl}'`,
    ];

    if (input.installPath) {
      commandParts.push(`INSTALL_DIR='${input.installPath}'`);
    }

    if (input.repoUrl) {
      commandParts.push(`REPO_URL='${input.repoUrl}'`);
    }

    if (input.repoBranch) {
      commandParts.push(`REPO_BRANCH='${input.repoBranch}'`);
    }

    commandParts.push(
      `bash <(curl -fsSL '${input.remoteInstallScriptUrl || DEFAULT_INSTALLER.remoteInstallScriptUrl}')`,
    );

    return commandParts.join(' ');
  }

  protected getSourceFieldValue(
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>,
    sourceField: DeliveryManifestDomainSourceField,
  ) {
    const domainValues = this.readDeploymentDomainValues(deployment);
    if (domainValues[sourceField]) {
      return domainValues[sourceField];
    }
    return undefined;
  }

  protected resolveManifestFieldValue(input: {
    field: DeliveryManifestField;
    appValues: DeliverySettingValues;
    deploymentValues: DeliverySettingValues;
    appSecrets: DeliverySettingSecrets;
    deploymentSecrets: DeliverySettingSecrets;
  }) {
    if (input.field.type === 'secret') {
      const candidate =
        input.field.scope === 'user_input'
          ? input.deploymentSecrets[input.field.key] || input.appSecrets[input.field.key]
          : input.appSecrets[input.field.key];

      return candidate || undefined;
    }

    const candidate =
      input.field.scope === 'user_input'
        ? (input.deploymentValues[input.field.key] ?? input.appValues[input.field.key])
        : input.appValues[input.field.key];

    if (typeof candidate === 'boolean') {
      return candidate;
    }

    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }

    return input.field.defaultValue;
  }

  protected validateDeploymentInputs(input: {
    manifest: DeliveryManifest | null;
    values: DeliverySettingValues;
    secrets: DeliverySettingSecrets;
    domainValues: Record<string, string>;
  }) {
    if (!input.manifest) {
      if (Object.keys(input.domainValues).length > 0) {
        throw httpError(422, 'Delivery manifest is required for deployment domain fields');
      }
      return;
    }

    const allowedDomainFields = new Set(input.manifest.domainSlots.map((slot) => slot.sourceField));
    for (const key of Object.keys(input.domainValues)) {
      if (!allowedDomainFields.has(key)) {
        throw httpError(422, `Unexpected deployment domain field: ${key}`);
      }
    }

    for (const slot of input.manifest.domainSlots) {
      const slotValue = input.domainValues[slot.sourceField];
      if (slot.required && !slotValue) {
        throw httpError(422, `${slot.label} is required`);
      }
    }

    for (const key of Object.keys(input.values)) {
      const field = findDeliveryManifestField(input.manifest, key);
      if (!field || field.scope !== 'user_input' || field.type === 'secret') {
        throw httpError(422, `Unexpected deployment input field: ${key}`);
      }
    }

    for (const key of Object.keys(input.secrets)) {
      const field = findDeliveryManifestField(input.manifest, key);
      if (!field || field.scope !== 'user_input' || field.type !== 'secret') {
        throw httpError(422, `Unexpected deployment secret field: ${key}`);
      }
    }

    for (const field of listDeliveryManifestFields(input.manifest, { scope: 'user_input' })) {
      if (!field.required) {
        continue;
      }

      if (field.type === 'secret') {
        if (!input.secrets[field.key]) {
          throw httpError(422, `${field.label} is required`);
        }
        continue;
      }

      const value = input.values[field.key];
      if (typeof value === 'boolean') {
        continue;
      }

      if (typeof value !== 'string' || value.trim().length === 0) {
        throw httpError(422, `${field.label} is required`);
      }
    }
  }

  protected async buildBootstrapPayload(input: {
    app: DeploymentAppRecord;
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>;
    entitlement?: Awaited<ReturnType<LicenseRepository['findEntitlementById']>> | null;
    token?: string;
  }) {
    const statusReportAuth = await this.ensureDeploymentStatusReportAuth(input.deployment);
    input.deployment = statusReportAuth.deployment;
    const manifest = this.readManifest(input.app);
    const appDefaults = this.readLegacyDeploymentDefaults(input.app);
    const entitlement =
      input.entitlement ??
      (input.deployment?.entitlementId
        ? await this.capabilities
            .createLicenseAccess(this.db)
            .findEntitlementById(input.deployment.entitlementId)
        : null);
    if (
      !entitlement ||
      entitlement.userId !== input.deployment?.userId ||
      entitlement.appId !== input.deployment?.appId
    ) {
      throw httpError(
        409,
        'Deployment entitlement is missing or no longer matches this deployment.',
      );
    }
    const policy = this.readEntitlementDeploymentPolicy(entitlement);
    const updatePolicy = this.readDeploymentRuntimeUpdatePolicy(input.deployment);
    const deliverySettings = await new DeliverySettingsService(this.db, this.env).getStoredSettings(
      input.app.code,
    );
    const deploymentValues = this.readDeploymentInputValues(input.deployment);
    const deploymentSecrets = this.readDeploymentInputSecrets(input.deployment);

    const appValues: DeliverySettingValues = {
      ...appDefaults.values,
      ...(deliverySettings?.values ?? {}),
    };
    const appSecrets: DeliverySettingSecrets = {
      ...(deliverySettings?.secrets ?? {}),
    };
    const installer = {
      repoUrl:
        manifest?.installer.repoUrl ||
        appDefaults.installer.repoUrl ||
        deliverySettings?.installer.repoUrl ||
        DEFAULT_INSTALLER.repoUrl,
      repoBranch:
        manifest?.installer.repoBranch ||
        appDefaults.installer.repoBranch ||
        deliverySettings?.installer.repoBranch ||
        DEFAULT_INSTALLER.repoBranch,
      remoteInstallScriptUrl:
        manifest?.installer.remoteInstallScriptUrl || DEFAULT_INSTALLER.remoteInstallScriptUrl,
      installPath:
        input.deployment?.installPath ||
        manifest?.installer.installPath ||
        DEFAULT_INSTALLER.installPath,
    };

    const envDefaults: Record<string, string> = {};

    if (manifest) {
      for (const slot of manifest.domainSlots) {
        const value = this.getSourceFieldValue(input.deployment, slot.sourceField);
        if (value) {
          envDefaults[slot.envKey] = value;
        }
      }

      for (const field of [...manifest.envFields, ...manifest.secretFields]) {
        const resolved = this.resolveManifestFieldValue({
          field,
          appValues,
          deploymentValues,
          appSecrets,
          deploymentSecrets,
        });

        if (typeof resolved === 'boolean') {
          envDefaults[field.key] = String(resolved);
          continue;
        }

        if (typeof resolved === 'string' && resolved.length > 0) {
          envDefaults[field.key] = resolved;
          if (field.key === 'GH_TOKEN' && !envDefaults.GITHUB_TOKEN) {
            envDefaults.GITHUB_TOKEN = resolved;
          }
        }
      }
    } else {
      const fallbackEntries = Object.entries({
        ...Object.fromEntries(
          Object.entries(appValues).map(([key, value]) => [
            key,
            typeof value === 'boolean' ? String(value) : value,
          ]),
        ),
        ...appSecrets,
      }).filter(([, value]) => typeof value === 'string' && value.length > 0);

      for (const [key, value] of fallbackEntries) {
        if (typeof value === 'string') {
          envDefaults[key] = value;
        }
      }

      if (envDefaults.GH_TOKEN && !envDefaults.GITHUB_TOKEN) {
        envDefaults.GITHUB_TOKEN = envDefaults.GH_TOKEN;
      }
    }

    const activeBindingSource =
      policy.domainBindingMode === 'lock_on_first_success' ? policy.domainBindingSource : 'none';
    envDefaults.FD_RUNTIME_IMAGE_UPDATE_POLICY = updatePolicy;
    envDefaults.FD_DOMAIN_BINDING_SOURCE = activeBindingSource;
    envDefaults.FD_DOMAIN_BINDING_SCOPE = policy.domainBindingScope;

    if (activeBindingSource !== 'none') {
      // Runtime host checks must use the exact deployed host, not the license binding scope.
      const boundHost = normalizeHostname(
        this.getSourceFieldValue(input.deployment, activeBindingSource),
      );

      if (boundHost.length > 0) {
        envDefaults.FD_BOUND_HOST = boundHost;
      }
    }

    const exchangeUrl = new URL(
      '/v1/deployments/bootstrap/exchange',
      this.env.PUBLIC_BASE_URL,
    ).toString();
    envDefaults.FD_STACK_DEPLOYMENT_ID = input.deployment.id;
    envDefaults.FD_STACK_STATUS_REPORT_URL = new URL(
      '/v1/deployments/status/report',
      this.env.PUBLIC_BASE_URL,
    ).toString();
    envDefaults.FD_STACK_STATUS_REPORT_TOKEN = statusReportAuth.token;
    envDefaults.FD_STACK_ACTION_PULL_URL = new URL(
      '/v1/deployments/actions/pull',
      this.env.PUBLIC_BASE_URL,
    ).toString();
    envDefaults.FD_STACK_ACTION_COMPLETE_URL = new URL(
      '/v1/deployments/actions/complete',
      this.env.PUBLIC_BASE_URL,
    ).toString();

    return {
      installPath: installer.installPath,
      exchangeUrl,
      repository: {
        url: installer.repoUrl,
        branch: installer.repoBranch,
      },
      assets: manifest?.assets ?? [],
      envDefaults,
      remoteInstallCommand: input.token
        ? this.buildRemoteInstallCommand({
            token: input.token,
            exchangeUrl,
            installPath: installer.installPath,
            repoUrl: installer.repoUrl,
            repoBranch: installer.repoBranch,
            remoteInstallScriptUrl: installer.remoteInstallScriptUrl,
          })
        : null,
      notes: [
        'Installer bootstrap now follows the synced deliveryManifest and any saved app-level preset overrides.',
        'User-input deployment values override app defaults for the current deployment.',
      ],
    };
  }

  protected buildExchangeCurl(token: string) {
    return `curl -fsSL -X POST '${new URL('/v1/deployments/bootstrap/exchange', this.env.PUBLIC_BASE_URL).toString()}' -H 'content-type: application/json' -d '${JSON.stringify({ token })}'`;
  }
}
