import { randomBytes } from 'node:crypto';

import type { DbClient } from '../../db/types';
import {
  findDeliveryManifestField,
  listDeliveryManifestFields,
  normalizeDeliveryManifest,
  type DeliveryManifest,
  type DeliveryManifestDomainSourceField,
  type DeliveryManifestField
} from '../../lib/delivery-manifest';
import {
  DeliverySettingsService,
  type DeliverySettingSecrets,
  type DeliverySettingValues
} from '../../lib/delivery-settings';
import {
  getDomainBindingValue,
  normalizeDeploymentPolicy,
  type DeploymentPolicy
} from '../../lib/deployment-policy';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/security';
import { decryptJson, encryptJson } from '../../lib/settings-crypto';
import { AppRepository } from '../app/repository';
import { AppService } from '../app/service';
import { AuthRepository } from '../auth/repository';
import { EventService } from '../event/service';
import { LicenseRepository } from '../license/repository';
import { DeploymentRepository } from './repository';

type DeploymentAppRecord = Awaited<ReturnType<AppService['getPublicApp']>>;

const DEFAULT_INSTALLER = {
  repoUrl: 'https://github.com/FutureDecade/fd-headless-wp-system.git',
  repoBranch: 'main',
  remoteInstallScriptUrl:
    'https://raw.githubusercontent.com/FutureDecade/fd-headless-wp-system/main/scripts/remote-install.sh',
  installPath: '/opt/fd-headless-wp-system'
};

const LEGACY_APP_DEFAULT_VALUE_KEYS: Record<string, { envKey: string; kind: 'string' | 'boolean' }> = {
  frontendImage: { envKey: 'FRONTEND_IMAGE', kind: 'string' },
  websocketImage: { envKey: 'WEBSOCKET_IMAGE', kind: 'string' },
  letsencryptEmail: { envKey: 'LETSENCRYPT_EMAIL', kind: 'string' },
  acrUsername: { envKey: 'ACR_USERNAME', kind: 'string' },
  wordpressFetchReleaseAssets: { envKey: 'WORDPRESS_FETCH_RELEASE_ASSETS', kind: 'boolean' },
  wordpressRunInit: { envKey: 'WORDPRESS_RUN_INIT', kind: 'boolean' },
  wordpressReleaseOwner: { envKey: 'WORDPRESS_RELEASE_OWNER', kind: 'string' },
  fdThemeReleaseTag: { envKey: 'FD_THEME_RELEASE_TAG', kind: 'string' },
  fdAdminUiReleaseTag: { envKey: 'FD_ADMIN_UI_RELEASE_TAG', kind: 'string' },
  fdMemberReleaseTag: { envKey: 'FD_MEMBER_RELEASE_TAG', kind: 'string' },
  fdPaymentReleaseTag: { envKey: 'FD_PAYMENT_RELEASE_TAG', kind: 'string' },
  fdCommerceReleaseTag: { envKey: 'FD_COMMERCE_RELEASE_TAG', kind: 'string' },
  fdContentTypesReleaseTag: { envKey: 'FD_CONTENT_TYPES_RELEASE_TAG', kind: 'string' },
  fdWebsocketPushReleaseTag: { envKey: 'FD_WEBSOCKET_PUSH_RELEASE_TAG', kind: 'string' },
  wpgraphqlJwtAuthReleaseTag: { envKey: 'WPGRAPHQL_JWT_AUTH_RELEASE_TAG', kind: 'string' },
  wpgraphqlTaxQueryRef: { envKey: 'WPGRAPHQL_TAX_QUERY_REF', kind: 'string' }
};

const WORDPRESS_ASSET_RELEASE_KEYS = [
  'FD_THEME_RELEASE_TAG',
  'FD_PAGE_COMPOSER_RELEASE_TAG',
  'FD_ADMIN_UI_RELEASE_TAG',
  'FD_MEMBER_RELEASE_TAG',
  'FD_PAYMENT_RELEASE_TAG',
  'FD_COMMERCE_RELEASE_TAG',
  'FD_CONTENT_TYPES_RELEASE_TAG',
  'FD_AI_ROUTER_RELEASE_TAG',
  'FD_WEBSOCKET_PUSH_RELEASE_TAG',
  'WPGRAPHQL_RELEASE_TAG',
  'WPGRAPHQL_JWT_AUTH_RELEASE_TAG',
  'WPGRAPHQL_TAX_QUERY_REF'
] as const;

const AVAILABLE_WORDPRESS_ASSET_RELEASE_KEYS = [
  'AVAILABLE_FD_THEME_RELEASE_TAG',
  'AVAILABLE_FD_PAGE_COMPOSER_RELEASE_TAG',
  'AVAILABLE_FD_ADMIN_UI_RELEASE_TAG',
  'AVAILABLE_FD_MEMBER_RELEASE_TAG',
  'AVAILABLE_FD_PAYMENT_RELEASE_TAG',
  'AVAILABLE_FD_COMMERCE_RELEASE_TAG',
  'AVAILABLE_FD_CONTENT_TYPES_RELEASE_TAG',
  'AVAILABLE_FD_AI_ROUTER_RELEASE_TAG',
  'AVAILABLE_FD_WEBSOCKET_PUSH_RELEASE_TAG',
  'AVAILABLE_WPGRAPHQL_RELEASE_TAG',
  'AVAILABLE_WPGRAPHQL_JWT_AUTH_RELEASE_TAG',
  'AVAILABLE_WPGRAPHQL_TAX_QUERY_REF'
] as const;

type DeploymentStatusReportPayload = {
  deploymentId: string;
  token: string;
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

type DeploymentDomainBindingSource = 'none' | DeliveryManifestDomainSourceField;
type DeploymentRuntimeUpdatePolicy = 'manual' | 'auto';

const DOMAIN_BINDING_SOURCE_LABELS: Record<DeliveryManifestDomainSourceField, string> = {
  primaryDomain: '主域名',
  adminDomain: '后台域名',
  wsDomain: 'WS 域名'
};

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

function isDeploymentDomainBindingSource(value: string): value is DeliveryManifestDomainSourceField {
  return value === 'primaryDomain' || value === 'adminDomain' || value === 'wsDomain';
}

function getDomainBindingSourceLabel(sourceField: DeploymentDomainBindingSource) {
  if (sourceField === 'none') {
    return '域名';
  }

  return DOMAIN_BINDING_SOURCE_LABELS[sourceField];
}

function normalizeDeploymentRuntimeUpdatePolicy(value: unknown): DeploymentRuntimeUpdatePolicy {
  return normalizeString(value) === 'auto' ? 'auto' : 'manual';
}

function pickStringRecord(values: Record<string, unknown>, keys: readonly string[]) {
  const result: Record<string, string | null> = {};

  for (const key of keys) {
    const normalized = normalizeString(values[key]);
    result[key] = normalized.length > 0 ? normalized : null;
  }

  return result;
}

export class DeploymentService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv
  ) {}

  private getEncryptionSecret() {
    return normalizeString(this.env.SETTINGS_ENCRYPTION_KEY) || this.env.JWT_SECRET;
  }

  private async resolveDeployableApp(input: {
    userId: string;
    appCode: string;
  }) {
    const app = await new AppService(this.db).getPublicApp(input.appCode);

    if (this.readDeliveryMode(app) !== 'one_click') {
      throw httpError(422, 'This app is not configured for one-click delivery');
    }

    const entitlementView = await new AppService(this.db).listUserEntitlementsForApp(
      input.appCode,
      input.userId
    );

    if (entitlementView.summary.length === 0) {
      throw httpError(403, 'You do not have an active deployment entitlement for this app');
    }

    return {
      app,
      entitlementSummary: entitlementView.summary
    };
  }

  private isEffectiveEntitlement(entitlement: {
    status: string;
    expiresAt: Date | null;
  }) {
    return entitlement.status === 'active' && (!entitlement.expiresAt || entitlement.expiresAt.getTime() >= Date.now());
  }

  private async resolveDeploymentEntitlement(input: {
    userId: string;
    appId: string;
    entitlementId: string;
  }) {
    const repository = new LicenseRepository(this.db);

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

  private async loadDeploymentEntitlement(
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>
  ) {
    if (!deployment?.entitlementId) {
      throw httpError(409, 'Deployment is not bound to an entitlement. Create a new deployment with an active entitlement.');
    }

    const entitlement = await new LicenseRepository(this.db).findEntitlementById(deployment.entitlementId);
    if (!entitlement || entitlement.userId !== deployment.userId || entitlement.appId !== deployment.appId) {
      throw httpError(409, 'Deployment entitlement is missing or no longer matches this deployment.');
    }
    if (!this.isEffectiveEntitlement(entitlement)) {
      throw httpError(403, 'Deployment entitlement is not active. Restore access before continuing.');
    }
    const plan = await new LicenseRepository(this.db).getPlanById(entitlement.planId);
    if (!plan) {
      throw httpError(500, 'Deployment entitlement is missing related plan');
    }

    return { entitlement, plan };
  }

  private async hydrateDeployments(
    rows: Awaited<ReturnType<DeploymentRepository['listDeploymentsByUserId']>>
  ) {
    const appIds = [...new Set(rows.map((item) => item.appId))];
    const userIds = [...new Set(rows.map((item) => item.userId))];
    const entitlementIds = [
      ...new Set(rows.map((item) => item.entitlementId).filter((item): item is string => Boolean(item)))
    ];
    const [apps, users, tokens, entitlements] = await Promise.all([
      new AppRepository(this.db).listAppsByIds(appIds),
      new AuthRepository(this.db).listUsersByIds(userIds),
      new DeploymentRepository(this.db).listTokensByDeploymentIds(rows.map((item) => item.id)),
      new LicenseRepository(this.db).listEntitlementsByIds(entitlementIds)
    ]);

    const appMap = new Map(apps.map((item) => [item.id, item]));
    const userMap = new Map(users.map((item) => [item.id, item]));
    const entitlementMap = new Map(entitlements.map((item) => [item.id, item]));
    const planIds = [...new Set(entitlements.map((item) => item.planId))];
    const plans = await new LicenseRepository(this.db).listPlansByIds(planIds);
    const planMap = new Map(plans.map((item) => [item.id, item]));
    const latestTokenMap = new Map<string, (typeof tokens)[number]>();
    for (const token of tokens) {
      if (!latestTokenMap.has(token.deploymentId)) {
        latestTokenMap.set(token.deploymentId, token);
      }
    }

    return Promise.all(rows.map(async (row) => {
      const app = appMap.get(row.appId) ?? null;
      const user = userMap.get(row.userId) ?? null;
      const token = latestTokenMap.get(row.id) ?? null;
      const entitlement = row.entitlementId ? entitlementMap.get(row.entitlementId) ?? null : null;
      const plan = entitlement ? planMap.get(entitlement.planId) ?? null : null;
      const deliveryValues = this.readDeploymentInputValues(row);
      const configuredSecretKeys = Object.keys(this.readDeploymentInputSecrets(row));
      const updatePolicy = this.readDeploymentRuntimeUpdatePolicy(row);
      const meta = this.normalizeMeta(row.meta);
      const runtimeUpdateMeta = this.normalizeMeta(meta.runtimeUpdate);
      const wordpressAssetsMeta = this.normalizeMeta(meta.wordpressAssetsUpdate);
      const policy = entitlement ? this.readEntitlementDeploymentPolicy(entitlement) : null;
      const binding = this.readEntitlementBinding(entitlement);
      const activeBindingSource = policy?.domainBindingMode === 'lock_on_first_success'
        ? policy.domainBindingSource
        : 'none';
      const currentBoundValue =
        activeBindingSource === 'none'
          ? null
          : getDomainBindingValue(this.getSourceFieldValue(row, activeBindingSource), policy?.domainBindingScope ?? 'registrable_domain') || null;
      const isDomainLocked =
        activeBindingSource !== 'none' &&
        Boolean(binding.boundDomain) &&
        currentBoundValue === binding.boundDomain;
      const envDefaults = app
        ? (await this.buildBootstrapPayload({
            app: app as DeploymentAppRecord,
            deployment: row,
            entitlement
          })).envDefaults
        : {};
      const reportedCurrentRuntimeImages = {
        frontendImage: normalizeString(runtimeUpdateMeta.currentFrontendImage) || null,
        websocketImage: normalizeString(runtimeUpdateMeta.currentWebsocketImage) || null
      };
      const currentRuntimeImages = {
        frontendImage:
          reportedCurrentRuntimeImages.frontendImage || normalizeString(envDefaults.FRONTEND_IMAGE) || null,
        websocketImage:
          reportedCurrentRuntimeImages.websocketImage || normalizeString(envDefaults.WEBSOCKET_IMAGE) || null
      };
      const availableRuntimeImages = {
        frontendImage: normalizeString(runtimeUpdateMeta.availableFrontendImage) || null,
        websocketImage: normalizeString(runtimeUpdateMeta.availableWebsocketImage) || null,
        offeredAt: normalizeString(runtimeUpdateMeta.offeredAt) || null,
        appliedAt: normalizeString(runtimeUpdateMeta.appliedAt) || null
      };
      const currentWordpressAssetReleases = Object.fromEntries(
        WORDPRESS_ASSET_RELEASE_KEYS.map((key) => [
          key,
          normalizeString(this.normalizeMeta(wordpressAssetsMeta.current)[key]) ||
            normalizeString(envDefaults[key]) ||
            null
        ])
      ) as Record<(typeof WORDPRESS_ASSET_RELEASE_KEYS)[number], string | null>;
      const availableWordpressAssetReleases = Object.fromEntries(
        AVAILABLE_WORDPRESS_ASSET_RELEASE_KEYS.map((key) => [
          key,
          normalizeString(this.normalizeMeta(wordpressAssetsMeta.available)[key]) ||
            normalizeString(wordpressAssetsMeta[key]) ||
            null
        ])
      ) as Record<(typeof AVAILABLE_WORDPRESS_ASSET_RELEASE_KEYS)[number], string | null>;
      const pendingAction = this.normalizeMeta(meta.pendingAction);
      const lastAction = this.normalizeMeta(meta.lastAction);

      return {
        ...row,
        deliveryValues,
        configuredSecretKeys,
        updatePolicy,
        currentRuntimeImages,
        availableRuntimeImages,
        currentWordpressAssetReleases,
        availableWordpressAssetReleases,
        pendingAction:
          normalizeString(pendingAction.id).length > 0
            ? {
                id: normalizeString(pendingAction.id),
                kind: normalizeString(pendingAction.kind) as DeploymentActionKind,
                requestedAt: normalizeString(pendingAction.requestedAt) || null
              }
            : null,
        lastAction:
          normalizeString(lastAction.id).length > 0
            ? {
                id: normalizeString(lastAction.id),
                kind: normalizeString(lastAction.kind) as DeploymentActionKind,
                status: normalizeString(lastAction.status) || 'completed',
                message: normalizeString(lastAction.message) || null,
                finishedAt: normalizeString(lastAction.finishedAt) || null
              }
            : null,
        domainBinding: {
          sourceField: activeBindingSource,
          isLocked: isDomainLocked,
          boundDomain: binding.boundDomain,
          boundAt: binding.boundAt,
          scope: binding.scope ?? policy?.domainBindingScope ?? 'registrable_domain'
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
                    interval: plan.interval
                  }
                : null
            }
          : null,
        user: user
          ? { id: user.id, email: user.email, displayName: user.displayName }
          : null,
        app: app
          ? { id: app.id, code: app.code, name: app.name, type: app.type }
          : null,
        latestToken: token
          ? {
              id: token.id,
              tokenHint: token.tokenHint,
              status: token.status,
              expiresAt: token.expiresAt,
              usedAt: token.usedAt,
              createdAt: token.createdAt
            }
          : null
      };
    }));
  }

  private createPlainToken() {
    return `fddp_${randomBytes(24).toString('base64url')}`;
  }

  private createStatusReportToken() {
    return `fdsr_${randomBytes(24).toString('base64url')}`;
  }

  private normalizeMeta(meta: unknown) {
    return meta && typeof meta === 'object' && !Array.isArray(meta)
      ? { ...(meta as Record<string, unknown>) }
      : {};
  }

  private async ensureDeploymentStatusReportAuth(
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>
  ) {
    const meta = this.normalizeMeta(deployment?.meta);
    const runtimeStatusReport = this.normalizeMeta(meta.runtimeStatusReport);
    let token = '';

    if (runtimeStatusReport.token) {
      try {
        const decrypted = decryptJson<{ token?: string }>(
          runtimeStatusReport.token,
          this.getEncryptionSecret()
        );
        token = normalizeString(decrypted.token);
      } catch {
        token = '';
      }
    }

    if (token.length > 0) {
      return {
        deployment,
        token
      };
    }

    token = this.createStatusReportToken();
    meta.runtimeStatusReport = {
      tokenHint: token.slice(-8),
      token: encryptJson({ token }, this.getEncryptionSecret()),
      updatedAt: new Date().toISOString()
    };

    const updated = await new DeploymentRepository(this.db).updateDeployment(deployment.id, {
      meta
    });

    return {
      deployment: updated ?? deployment,
      token
    };
  }

  private readDeliveryMode(app: DeploymentAppRecord) {
    const meta = this.normalizeMeta(app.meta);
    const rawMode = meta.deliveryMode;

    if (rawMode === 'none' || rawMode === 'one_click') {
      return rawMode;
    }

    return 'none';
  }

  private readManifest(app: DeploymentAppRecord) {
    const meta = this.normalizeMeta(app.meta);
    return normalizeDeliveryManifest(meta.deliveryManifest);
  }

  private readLegacyDeploymentDefaults(app: DeploymentAppRecord) {
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
        repoBranch: normalizeString(raw.repoBranch) || undefined
      }
    };
  }

  private readEntitlementDeploymentPolicy(entitlement: { meta?: unknown } | null | undefined): DeploymentPolicy {
    const meta = this.normalizeMeta(entitlement?.meta);
    return normalizeDeploymentPolicy(meta.deploymentPolicy);
  }

  private readEntitlementBinding(entitlement: { meta?: unknown } | null | undefined): DeploymentBindingState {
    const meta = this.normalizeMeta(entitlement?.meta);
    const binding = this.normalizeMeta(meta.domainBinding);
    const rawSourceField = normalizeString(binding.sourceField);
    const sourceField = isDeploymentDomainBindingSource(rawSourceField)
      ? rawSourceField
      : 'none';
    const boundDomain = normalizeHostname(binding.boundValue) || null;
    const boundAt = normalizeString(binding.boundAt) || null;
    const scope = normalizeString(binding.scope) === 'exact_host' ? 'exact_host' : 'registrable_domain';

    return {
      sourceField,
      scope,
      boundDomain,
      boundAt
    };
  }

  private async updateEntitlementBinding(input: {
    entitlementId: string;
    policy: DeploymentPolicy;
    boundValue: string;
  }) {
    const repository = new LicenseRepository(this.db);
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
      boundAt: new Date().toISOString()
    };
    const updated = await repository.updateEntitlementMeta(input.entitlementId, meta);
    if (!updated) {
      throw httpError(500, 'Failed to bind entitlement domain');
    }
    return updated;
  }

  private readDeploymentRuntimeUpdatePolicy(
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>
  ): DeploymentRuntimeUpdatePolicy {
    const meta = this.normalizeMeta(deployment?.meta);
    const runtimeUpdate = this.normalizeMeta(meta.runtimeUpdate);
    return normalizeDeploymentRuntimeUpdatePolicy(runtimeUpdate.policy);
  }

  private readDeploymentInputValues(deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>) {
    const meta = this.normalizeMeta(deployment?.meta);
    const inputs = this.normalizeMeta(meta.deliveryInputs);
    return normalizeValueRecord(inputs.values);
  }

  private readDeploymentInputSecrets(
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>
  ) {
    const meta = this.normalizeMeta(deployment?.meta);
    const inputs = this.normalizeMeta(meta.deliveryInputs);
    const secretEnvelope = inputs.secrets;
    if (!secretEnvelope) {
      return {} as DeliverySettingSecrets;
    }

    try {
      return normalizeSecretRecord(decryptJson<unknown>(secretEnvelope, this.getEncryptionSecret()));
    } catch {
      return {};
    }
  }

  private collectDeploymentConfigIssues(input: {
    manifest: DeliveryManifest | null;
    values: DeliverySettingValues;
    secrets: DeliverySettingSecrets;
    primaryDomain?: string | null;
    adminDomain?: string | null;
    wsDomain?: string | null;
    policy?: DeploymentPolicy;
  }) {
    const issues: DeploymentConfigIssue[] = [];

    if (!input.manifest) {
      return issues;
    }

    const domainValueBySource: Record<DeliveryManifestDomainSourceField, string | undefined> = {
      primaryDomain: normalizeHostname(input.primaryDomain) || undefined,
      adminDomain: normalizeHostname(input.adminDomain) || undefined,
      wsDomain: normalizeHostname(input.wsDomain) || undefined
    };

    for (const slot of input.manifest.domainSlots) {
      if (!slot.required || domainValueBySource[slot.sourceField]) {
        continue;
      }

      issues.push({
        kind: 'domain_slot',
        key: slot.key,
        label: slot.label,
        sourceField: slot.sourceField
      });
    }

    if (
      input.policy?.domainBindingMode === 'lock_on_first_success' &&
      input.policy.domainBindingSource !== 'none'
    ) {
      const sourceField = input.policy.domainBindingSource;
      const alreadyTracked = issues.some((issue) => issue.kind === 'domain_slot' && issue.sourceField === sourceField);
      if (!alreadyTracked && !domainValueBySource[sourceField]) {
        issues.push({
          kind: 'domain_slot',
          key: sourceField,
          label: getDomainBindingSourceLabel(sourceField),
          sourceField
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
            fieldType: 'secret'
          });
        }
        continue;
      }

      if (field.type === 'boolean') {
        if (typeof input.values[field.key] === 'undefined' && typeof field.defaultValue !== 'boolean') {
          issues.push({
            kind: 'user_input',
            key: field.key,
            label: field.label,
            fieldType: 'boolean'
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
          fieldType: 'text'
        });
      }
    }

    return issues;
  }

  private createDomainBindingLockedError(binding: DeploymentBindingState) {
    return httpError(
      409,
      `${getDomainBindingSourceLabel(binding.sourceField)}已绑定到 ${binding.boundDomain}。如需更换，请提交工单处理。`,
      {
        code: 'deployment_domain_locked',
        boundSourceField: binding.sourceField,
        boundDomain: binding.boundDomain,
        boundAt: binding.boundAt
      }
    );
  }

  private assertDomainBindingEditable(input: {
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>;
    policy: DeploymentPolicy;
    binding: DeploymentBindingState;
    requestedPrimaryDomain?: string;
    requestedAdminDomain?: string;
    requestedWsDomain?: string;
  }) {
    const boundSourceField =
      input.policy.domainBindingMode === 'lock_on_first_success' ? input.policy.domainBindingSource : 'none';

    if (boundSourceField === 'none' || !input.binding.boundDomain) {
      return;
    }

    const requestedBySource: Partial<Record<DeliveryManifestDomainSourceField, string | undefined>> = {
      primaryDomain: input.requestedPrimaryDomain,
      adminDomain: input.requestedAdminDomain,
      wsDomain: input.requestedWsDomain
    };
    const nextBoundValue =
      typeof requestedBySource[boundSourceField] === 'string'
        ? getDomainBindingValue(requestedBySource[boundSourceField] ?? '', input.policy.domainBindingScope)
        : getDomainBindingValue(this.getSourceFieldValue(input.deployment, boundSourceField), input.policy.domainBindingScope);

    if (nextBoundValue === input.binding.boundDomain) {
      return;
    }

    throw this.createDomainBindingLockedError(input.binding);
  }

  private async ensureDeploymentReadyForTokenIssue(input: {
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
        : getDomainBindingValue(this.getSourceFieldValue(input.deployment, activeBindingSource), policy.domainBindingScope);
    const issues = this.collectDeploymentConfigIssues({
      manifest: this.readManifest(input.app),
      values: this.readDeploymentInputValues(input.deployment),
      secrets: this.readDeploymentInputSecrets(input.deployment),
      primaryDomain: input.deployment?.primaryDomain,
      adminDomain: input.deployment?.adminDomain,
      wsDomain: input.deployment?.wsDomain,
      policy
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
              sourceField: issue.sourceField
            })),
          missingFields: issues
            .filter((issue) => issue.kind === 'user_input')
            .map((issue) => ({
              key: issue.key,
              label: issue.label,
              fieldType: issue.fieldType
            }))
        }
      );
    }

    if (binding.boundDomain && activeBindingSource !== 'none' && currentBoundValue !== binding.boundDomain) {
      throw this.createDomainBindingLockedError(binding);
    }
  }

  private async bindDeploymentDomainOnExchange(input: {
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
      input.policy.domainBindingScope
    );
    if (!currentDomain) {
      throw httpError(409, `${getDomainBindingSourceLabel(sourceField)}不能为空，部署无法继续。`);
    }

    const entitlement = await new LicenseRepository(this.db).findEntitlementById(input.entitlementId);
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
      boundValue: currentDomain
    });

    return input.deployment;
  }

  private buildRemoteInstallCommand(input: {
    token: string;
    exchangeUrl: string;
    remoteInstallScriptUrl?: string;
    installPath?: string | null;
    repoUrl?: string;
    repoBranch?: string;
  }) {
    const commandParts = [
      `FD_STACK_DEPLOY_TOKEN='${input.token}'`,
      `FD_STACK_EXCHANGE_URL='${input.exchangeUrl}'`
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
      `bash <(curl -fsSL '${input.remoteInstallScriptUrl || DEFAULT_INSTALLER.remoteInstallScriptUrl}')`
    );

    return commandParts.join(' ');
  }

  private getSourceFieldValue(
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>,
    sourceField: DeliveryManifestDomainSourceField
  ) {
    switch (sourceField) {
      case 'adminDomain':
        return deployment?.adminDomain ?? undefined;
      case 'wsDomain':
        return deployment?.wsDomain ?? undefined;
      case 'primaryDomain':
      default:
        return deployment?.primaryDomain ?? undefined;
    }
  }

  private resolveManifestFieldValue(input: {
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
        ? input.deploymentValues[input.field.key] ?? input.appValues[input.field.key]
        : input.appValues[input.field.key];

    if (typeof candidate === 'boolean') {
      return candidate;
    }

    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }

    return input.field.defaultValue;
  }

  private validateDeploymentInputs(input: {
    manifest: DeliveryManifest | null;
    values: DeliverySettingValues;
    secrets: DeliverySettingSecrets;
    primaryDomain?: string;
    adminDomain?: string;
    wsDomain?: string;
  }) {
    if (!input.manifest) {
      return;
    }

    const domainValueBySource: Record<DeliveryManifestDomainSourceField, string | undefined> = {
      primaryDomain: normalizeString(input.primaryDomain) || undefined,
      adminDomain: normalizeString(input.adminDomain) || undefined,
      wsDomain: normalizeString(input.wsDomain) || undefined
    };

    for (const slot of input.manifest.domainSlots) {
      if (slot.required && !domainValueBySource[slot.sourceField]) {
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

  private async buildBootstrapPayload(input: {
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
        ? await new LicenseRepository(this.db).findEntitlementById(input.deployment.entitlementId)
        : null);
    if (!entitlement || entitlement.userId !== input.deployment?.userId || entitlement.appId !== input.deployment?.appId) {
      throw httpError(409, 'Deployment entitlement is missing or no longer matches this deployment.');
    }
    const policy = this.readEntitlementDeploymentPolicy(entitlement);
    const binding = this.readEntitlementBinding(entitlement);
    const updatePolicy = this.readDeploymentRuntimeUpdatePolicy(input.deployment);
    const deliverySettings = await new DeliverySettingsService(this.db, this.env).getStoredSettings(
      input.app.code
    );
    const deploymentValues = this.readDeploymentInputValues(input.deployment);
    const deploymentSecrets = this.readDeploymentInputSecrets(input.deployment);

    const appValues: DeliverySettingValues = {
      ...appDefaults.values,
      ...(deliverySettings?.values ?? {})
    };
    const appSecrets: DeliverySettingSecrets = {
      ...(deliverySettings?.secrets ?? {})
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
        DEFAULT_INSTALLER.installPath
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
          deploymentSecrets
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
        FRONTEND_DOMAIN: input.deployment?.primaryDomain ?? undefined,
        ADMIN_DOMAIN: input.deployment?.adminDomain ?? undefined,
        WS_DOMAIN: input.deployment?.wsDomain ?? undefined,
        ...Object.fromEntries(
          Object.entries(appValues).map(([key, value]) => [key, typeof value === 'boolean' ? String(value) : value])
        ),
        ...appSecrets
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
      const boundHost =
        binding.boundDomain ||
        getDomainBindingValue(
          this.getSourceFieldValue(input.deployment, activeBindingSource),
          policy.domainBindingScope
        ) ||
        '';

      if (boundHost.length > 0) {
        envDefaults.FD_BOUND_HOST = boundHost;
      }
    }

    const exchangeUrl = new URL('/v1/deployments/bootstrap/exchange', this.env.PUBLIC_BASE_URL).toString();
    envDefaults.FD_STACK_DEPLOYMENT_ID = input.deployment.id;
    envDefaults.FD_STACK_STATUS_REPORT_URL = new URL(
      '/v1/deployments/status/report',
      this.env.PUBLIC_BASE_URL
    ).toString();
    envDefaults.FD_STACK_STATUS_REPORT_TOKEN = statusReportAuth.token;
    envDefaults.FD_STACK_ACTION_PULL_URL = new URL(
      '/v1/deployments/actions/pull',
      this.env.PUBLIC_BASE_URL
    ).toString();
    envDefaults.FD_STACK_ACTION_COMPLETE_URL = new URL(
      '/v1/deployments/actions/complete',
      this.env.PUBLIC_BASE_URL
    ).toString();

    return {
      installPath: installer.installPath,
      exchangeUrl,
      repository: {
        url: installer.repoUrl,
        branch: installer.repoBranch
      },
      envDefaults,
      remoteInstallCommand: input.token
        ? this.buildRemoteInstallCommand({
            token: input.token,
            exchangeUrl,
            installPath: installer.installPath,
            repoUrl: installer.repoUrl,
            repoBranch: installer.repoBranch,
            remoteInstallScriptUrl: installer.remoteInstallScriptUrl
          })
        : null,
      notes: [
        'Installer bootstrap now follows the synced deliveryManifest and any saved app-level preset overrides.',
        'User-input deployment values override app defaults for the current deployment.'
      ]
    };
  }

  private buildExchangeCurl(token: string) {
    return `curl -fsSL -X POST '${new URL('/v1/deployments/bootstrap/exchange', this.env.PUBLIC_BASE_URL).toString()}' -H 'content-type: application/json' -d '${JSON.stringify({ token })}'`;
  }

  async listUserDeployments(userId: string) {
    const rows = await new DeploymentRepository(this.db).listDeploymentsByUserId(userId);
    return {
      items: await this.hydrateDeployments(rows)
    };
  }

  async createDeployment(input: {
    userId: string;
    appCode: string;
    entitlementId: string;
    label: string;
    environment: string;
    serverHost?: string;
    primaryDomain?: string;
    adminDomain?: string;
    wsDomain?: string;
    installPath?: string;
    updatePolicy?: DeploymentRuntimeUpdatePolicy;
    values?: DeliverySettingValues;
    secrets?: DeliverySettingSecrets;
  }) {
    const selection = await this.resolveDeployableApp({
      userId: input.userId,
      appCode: input.appCode
    });
    const { entitlement, plan } = await this.resolveDeploymentEntitlement({
      userId: input.userId,
      appId: selection.app.id,
      entitlementId: input.entitlementId
    });
    const policy = this.readEntitlementDeploymentPolicy(entitlement);
    const activeCount = await new DeploymentRepository(this.db).countActiveDeploymentsByEntitlementId({
      entitlementId: entitlement.id
    });

    if (activeCount >= policy.maxActiveDeployments) {
      throw httpError(
        409,
        `Active deployment limit reached for this entitlement (${policy.maxActiveDeployments}). Deactivate an existing deployment or buy another entitlement before creating a new one.`
      );
    }

    const manifest = this.readManifest(selection.app);
    const deploymentValues = normalizeValueRecord(input.values);
    const deploymentSecrets = normalizeSecretRecord(input.secrets);

    this.validateDeploymentInputs({
      manifest,
      values: deploymentValues,
      secrets: deploymentSecrets,
      primaryDomain: input.primaryDomain,
      adminDomain: input.adminDomain,
      wsDomain: input.wsDomain
    });

    const creationIssues = this.collectDeploymentConfigIssues({
      manifest,
      values: deploymentValues,
      secrets: deploymentSecrets,
      primaryDomain: input.primaryDomain,
      adminDomain: input.adminDomain,
      wsDomain: input.wsDomain,
      policy
    });

    if (creationIssues.length > 0) {
      const firstIssue = creationIssues[0];
      throw httpError(422, `${firstIssue.label} is required`);
    }

    const deploymentMeta: Record<string, unknown> = {
      appCode: selection.app.code,
      planCode: plan.code,
      runtimeUpdate: {
        policy: normalizeDeploymentRuntimeUpdatePolicy(input.updatePolicy)
      }
    };

    if (Object.keys(deploymentValues).length > 0 || Object.keys(deploymentSecrets).length > 0) {
      deploymentMeta.deliveryInputs = {
        values: deploymentValues,
        secrets:
          Object.keys(deploymentSecrets).length > 0
            ? encryptJson(deploymentSecrets, this.getEncryptionSecret())
            : undefined
      };
    }

    const deployment = await new DeploymentRepository(this.db).createDeployment({
      userId: input.userId,
      appId: selection.app.id,
      entitlementId: entitlement.id,
      label: input.label,
      environment: input.environment,
      serverHost: input.serverHost ?? null,
      primaryDomain: input.primaryDomain ?? null,
      adminDomain: input.adminDomain ?? null,
      wsDomain: input.wsDomain ?? null,
      installPath: input.installPath ?? manifest?.installer.installPath ?? DEFAULT_INSTALLER.installPath,
      meta: deploymentMeta
    });

    await new EventService(this.db).capture({
      userId: input.userId,
      appId: selection.app.id,
      eventName: 'deployment.created',
      properties: {
        deploymentId: deployment.id,
        appCode: selection.app.code,
        environment: deployment.environment
      }
    });

    const [hydrated] = await this.hydrateDeployments([deployment]);
    return hydrated;
  }

  async updateDeployment(input: {
    deploymentId: string;
    userId: string;
    label?: string;
    environment?: string;
    serverHost?: string;
    primaryDomain?: string;
    adminDomain?: string;
    wsDomain?: string;
    installPath?: string;
    updatePolicy?: DeploymentRuntimeUpdatePolicy;
    values?: DeliverySettingValues;
    secrets?: DeliverySettingSecrets;
  }) {
    const repository = new DeploymentRepository(this.db);
    const deployment = await repository.findDeploymentById(input.deploymentId);
    if (!deployment || deployment.userId !== input.userId) {
      throw httpError(404, 'Deployment not found');
    }

    const appRow = await new AppRepository(this.db).findAppById(deployment.appId);
    if (!appRow) {
      throw httpError(404, 'App not found');
    }

    const app = await new AppService(this.db).getPublicApp(appRow.code);
    const { entitlement } = await this.loadDeploymentEntitlement(deployment);
    const manifest = this.readManifest(app);
    const policy = this.readEntitlementDeploymentPolicy(entitlement);
    const binding = this.readEntitlementBinding(entitlement);
    const currentValues = this.readDeploymentInputValues(deployment);
    const currentSecrets = this.readDeploymentInputSecrets(deployment);
    const nextValues = {
      ...currentValues,
      ...normalizeValueRecord(input.values)
    };
    const nextSecrets = {
      ...currentSecrets,
      ...normalizeSecretRecord(input.secrets)
    };
    const nextPrimaryDomain = input.primaryDomain ?? deployment.primaryDomain ?? undefined;
    const nextAdminDomain = input.adminDomain ?? deployment.adminDomain ?? undefined;
    const nextWsDomain = input.wsDomain ?? deployment.wsDomain ?? undefined;

    this.validateDeploymentInputs({
      manifest,
      values: nextValues,
      secrets: nextSecrets,
      primaryDomain: nextPrimaryDomain,
      adminDomain: nextAdminDomain,
      wsDomain: nextWsDomain
    });

    const requestedPrimaryDomain =
      typeof input.primaryDomain === 'string' ? input.primaryDomain.trim() || '' : undefined;
    const requestedAdminDomain =
      typeof input.adminDomain === 'string' ? input.adminDomain.trim() || '' : undefined;
    const requestedWsDomain =
      typeof input.wsDomain === 'string' ? input.wsDomain.trim() || '' : undefined;
    this.assertDomainBindingEditable({
      deployment,
      policy,
      binding,
      requestedPrimaryDomain,
      requestedAdminDomain,
      requestedWsDomain
    });

    const nextMeta = this.normalizeMeta(deployment.meta);
    const nextRuntimeUpdate = this.normalizeMeta(nextMeta.runtimeUpdate);
    nextRuntimeUpdate.policy = normalizeDeploymentRuntimeUpdatePolicy(
      typeof input.updatePolicy === 'string' ? input.updatePolicy : nextRuntimeUpdate.policy
    );
    nextMeta.runtimeUpdate = nextRuntimeUpdate;

    if (Object.keys(nextValues).length > 0 || Object.keys(nextSecrets).length > 0) {
      nextMeta.deliveryInputs = {
        values: nextValues,
        secrets:
          Object.keys(nextSecrets).length > 0
            ? encryptJson(nextSecrets, this.getEncryptionSecret())
            : undefined
      };
    } else {
      delete nextMeta.deliveryInputs;
    }

    const updated = await repository.updateDeployment(deployment.id, {
      label: input.label?.trim() || deployment.label,
      environment: input.environment?.trim() || deployment.environment,
      serverHost: typeof input.serverHost === 'string' ? input.serverHost.trim() || null : deployment.serverHost,
      primaryDomain:
        typeof input.primaryDomain === 'string' ? input.primaryDomain.trim() || null : deployment.primaryDomain,
      adminDomain: typeof input.adminDomain === 'string' ? input.adminDomain.trim() || null : deployment.adminDomain,
      wsDomain: typeof input.wsDomain === 'string' ? input.wsDomain.trim() || null : deployment.wsDomain,
      installPath: input.installPath?.trim() || deployment.installPath,
      meta: nextMeta
    });

    if (!updated) {
      throw httpError(500, 'Failed to update deployment');
    }

    await new EventService(this.db).capture({
      userId: input.userId,
      appId: deployment.appId,
      eventName: 'deployment.updated',
      properties: {
        deploymentId: deployment.id
      }
    });

    const [hydrated] = await this.hydrateDeployments([updated]);
    return hydrated;
  }

  async issueDeploymentToken(input: {
    deploymentId: string;
    userId: string;
    expiresInHours: number;
  }) {
    const repository = new DeploymentRepository(this.db);
    const deployment = await repository.findDeploymentById(input.deploymentId);
    if (!deployment || deployment.userId !== input.userId) {
      throw httpError(404, 'Deployment not found');
    }

    if (deployment.status !== 'active') {
      throw httpError(409, 'Deployment is inactive. Reactivate or create a new deployment before issuing a token.');
    }

    const app = await new AppService(this.db).getPublicApp(
      (await new AppRepository(this.db).findAppById(deployment.appId))?.code ?? ''
    );
    await this.ensureDeploymentReadyForTokenIssue({
      app,
      deployment
    });

    await repository.expireActiveTokensByDeploymentId(deployment.id);

    const plainToken = this.createPlainToken();
    const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);
    const token = await repository.createDeploymentToken({
      deploymentId: deployment.id,
      issuedByUserId: input.userId,
      tokenHash: hashPassword(plainToken),
      tokenHint: plainToken.slice(-8),
      expiresAt,
      meta: {
        exchangeUrl: new URL('/v1/deployments/bootstrap/exchange', this.env.PUBLIC_BASE_URL).toString()
      }
    });

    await repository.updateDeployment(deployment.id, {
      lastTokenIssuedAt: new Date()
    });

    await new EventService(this.db).capture({
      userId: input.userId,
      appId: deployment.appId,
      eventName: 'deployment.token_issued',
      properties: {
        deploymentId: deployment.id,
        tokenId: token.id,
        expiresAt: expiresAt.toISOString()
      }
    });

    const bootstrap = await this.buildBootstrapPayload({
      app,
      deployment,
      token: plainToken
    });

    return {
      deploymentId: deployment.id,
      tokenId: token.id,
      tokenHint: token.tokenHint,
      token: plainToken,
      exchangeUrl: bootstrap.exchangeUrl,
      exchangeCurl: this.buildExchangeCurl(plainToken),
      remoteInstallCommand: bootstrap.remoteInstallCommand,
      expiresAt
    };
  }

  async exchangeBootstrapToken(token: string) {
    const tokenHint = token.slice(-8);
    const candidates = await new DeploymentRepository(this.db).listActiveTokensByHint(tokenHint);
    const matched = candidates.find((item) => verifyPassword(token, item.tokenHash));

    if (!matched) {
      throw httpError(401, 'Deployment token is invalid or expired');
    }

    const repository = new DeploymentRepository(this.db);
    const deployment = await repository.findDeploymentById(matched.deploymentId);
    if (!deployment) {
      throw httpError(404, 'Deployment not found');
    }

    const [hydrated] = await this.hydrateDeployments([deployment]);
    const app = await new AppService(this.db).getPublicApp(hydrated.app?.code ?? '');
    const { entitlement } = await this.loadDeploymentEntitlement(deployment);
    const policy = this.readEntitlementDeploymentPolicy(entitlement);
    await this.ensureDeploymentReadyForTokenIssue({
      app,
      deployment
    });
    await repository.markTokenUsed(matched.id);
    const boundDeployment = await this.bindDeploymentDomainOnExchange({
      deployment,
      entitlementId: entitlement.id,
      policy
    });
    const updatedDeployment = await repository.updateDeployment(boundDeployment.id, {
      lastDeployedAt: new Date()
    });
    const targetDeployment = updatedDeployment ?? boundDeployment;

    await new EventService(this.db).capture({
      userId: deployment.userId,
      appId: deployment.appId,
      eventName: 'deployment.token_exchanged',
      properties: {
        deploymentId: deployment.id,
        tokenId: matched.id
      }
    });

    return {
      deployment: (await this.hydrateDeployments([targetDeployment]))[0],
      bootstrap: await this.buildBootstrapPayload({
        app,
        deployment: targetDeployment,
        token
      })
    };
  }

  async reportDeploymentStatus(input: DeploymentStatusReportPayload) {
    const repository = new DeploymentRepository(this.db);
    const deployment = await repository.findDeploymentById(input.deploymentId);

    if (!deployment) {
      throw httpError(404, 'Deployment not found');
    }

    const meta = this.normalizeMeta(deployment.meta);
    const runtimeStatusReport = this.normalizeMeta(meta.runtimeStatusReport);
    let expectedToken = '';

    if (runtimeStatusReport.token) {
      try {
        const decrypted = decryptJson<{ token?: string }>(
          runtimeStatusReport.token,
          this.getEncryptionSecret()
        );
        expectedToken = normalizeString(decrypted.token);
      } catch {
        expectedToken = '';
      }
    }

    if (!expectedToken || expectedToken !== input.token) {
      throw httpError(401, 'Deployment status report token is invalid');
    }

    const runtimeUpdate = this.normalizeMeta(meta.runtimeUpdate);
    const hadAvailableRuntimeUpdate =
      normalizeString(runtimeUpdate.availableFrontendImage).length > 0 ||
      normalizeString(runtimeUpdate.availableWebsocketImage).length > 0;
    if (input.runtimeImages) {
      if (typeof input.runtimeImages.currentFrontendImage !== 'undefined') {
        runtimeUpdate.currentFrontendImage = input.runtimeImages.currentFrontendImage ?? '';
      }
      if (typeof input.runtimeImages.currentWebsocketImage !== 'undefined') {
        runtimeUpdate.currentWebsocketImage = input.runtimeImages.currentWebsocketImage ?? '';
      }
      if (typeof input.runtimeImages.availableFrontendImage !== 'undefined') {
        runtimeUpdate.availableFrontendImage = input.runtimeImages.availableFrontendImage ?? '';
      }
      if (typeof input.runtimeImages.availableWebsocketImage !== 'undefined') {
        runtimeUpdate.availableWebsocketImage = input.runtimeImages.availableWebsocketImage ?? '';
      }
      if (typeof input.runtimeImages.offeredAt !== 'undefined') {
        runtimeUpdate.offeredAt = input.runtimeImages.offeredAt ?? '';
      }
      if (typeof input.runtimeImages.appliedAt !== 'undefined') {
        runtimeUpdate.appliedAt = input.runtimeImages.appliedAt ?? '';
      }
    }
    meta.runtimeUpdate = runtimeUpdate;
    const hasAvailableRuntimeUpdate =
      normalizeString(runtimeUpdate.availableFrontendImage).length > 0 ||
      normalizeString(runtimeUpdate.availableWebsocketImage).length > 0;

    const wordpressAssetsUpdate = this.normalizeMeta(meta.wordpressAssetsUpdate);
    const previousWordpressAvailable = this.normalizeMeta(wordpressAssetsUpdate.available);
    const hadAvailableWordpressUpdate =
      Object.values(previousWordpressAvailable).some((value) => normalizeString(value).length > 0) ||
      AVAILABLE_WORDPRESS_ASSET_RELEASE_KEYS.some(
        (key) => normalizeString(wordpressAssetsUpdate[key]).length > 0
      );
    if (input.wordpressAssets) {
      if (typeof input.wordpressAssets.current !== 'undefined') {
        wordpressAssetsUpdate.current = input.wordpressAssets.current ?? {};
      }
      if (typeof input.wordpressAssets.available !== 'undefined') {
        wordpressAssetsUpdate.available = input.wordpressAssets.available ?? {};
      }
      if (typeof input.wordpressAssets.offeredAt !== 'undefined') {
        wordpressAssetsUpdate.offeredAt = input.wordpressAssets.offeredAt ?? '';
      }
      if (typeof input.wordpressAssets.appliedAt !== 'undefined') {
        wordpressAssetsUpdate.appliedAt = input.wordpressAssets.appliedAt ?? '';
      }
    }
    meta.wordpressAssetsUpdate = wordpressAssetsUpdate;
    const currentWordpressAvailable = this.normalizeMeta(wordpressAssetsUpdate.available);
    const hasAvailableWordpressUpdate =
      Object.values(currentWordpressAvailable).some((value) => normalizeString(value).length > 0) ||
      AVAILABLE_WORDPRESS_ASSET_RELEASE_KEYS.some(
        (key) => normalizeString(wordpressAssetsUpdate[key]).length > 0
      );

    meta.runtimeStatusReport = {
      ...runtimeStatusReport,
      lastReportedAt: new Date().toISOString()
    };

    const updated = await repository.updateDeployment(deployment.id, {
      meta
    });

    if (!updated) {
      throw httpError(500, 'Failed to store deployment status report');
    }

    await new EventService(this.db).capture({
      userId: deployment.userId,
      appId: deployment.appId,
      eventName: 'deployment.status_reported',
      properties: {
        deploymentId: deployment.id
      }
    });

    if (!hadAvailableRuntimeUpdate && hasAvailableRuntimeUpdate) {
      await new EventService(this.db).capture({
        userId: deployment.userId,
        appId: deployment.appId,
        eventName: 'deployment.runtime_update_available',
        properties: {
          deploymentId: deployment.id
        }
      });
    }

    if (!hadAvailableWordpressUpdate && hasAvailableWordpressUpdate) {
      await new EventService(this.db).capture({
        userId: deployment.userId,
        appId: deployment.appId,
        eventName: 'deployment.wordpress_update_available',
        properties: {
          deploymentId: deployment.id
        }
      });
    }

    return { ok: true };
  }

  async requestDeploymentAction(input: {
    deploymentId: string;
    userId: string;
    kind: DeploymentActionKind;
  }) {
    const repository = new DeploymentRepository(this.db);
    const deployment = await repository.findDeploymentById(input.deploymentId);
    if (!deployment || deployment.userId !== input.userId) {
      throw httpError(404, 'Deployment not found');
    }
    await this.loadDeploymentEntitlement(deployment);

    const meta = this.normalizeMeta(deployment.meta);
    const runtimeUpdate = this.normalizeMeta(meta.runtimeUpdate);
    const wordpressAssetsUpdate = this.normalizeMeta(meta.wordpressAssetsUpdate);

    if (input.kind === 'apply_runtime_images' || input.kind === 'ignore_runtime_images') {
      const hasAvailableRuntimeImage =
        normalizeString(runtimeUpdate.availableFrontendImage).length > 0 ||
        normalizeString(runtimeUpdate.availableWebsocketImage).length > 0;
      if (!hasAvailableRuntimeImage) {
        throw httpError(409, 'No available runtime image update to process');
      }
    }

    if (input.kind === 'apply_wordpress_assets' || input.kind === 'ignore_wordpress_assets') {
      const hasAvailableWordpressAssets =
        Object.values(this.normalizeMeta(wordpressAssetsUpdate.available)).some(
          (value) => normalizeString(value).length > 0
        ) ||
        AVAILABLE_WORDPRESS_ASSET_RELEASE_KEYS.some(
          (key) => normalizeString(wordpressAssetsUpdate[key]).length > 0
        );
      if (!hasAvailableWordpressAssets) {
        throw httpError(409, 'No available WordPress asset update to process');
      }
    }

    meta.pendingAction = {
      id: `fdda_${randomBytes(12).toString('base64url')}`,
      kind: input.kind,
      requestedAt: new Date().toISOString(),
      requestedByUserId: input.userId
    };

    const updated = await repository.updateDeployment(deployment.id, { meta });
    if (!updated) {
      throw httpError(500, 'Failed to queue deployment action');
    }

    await new EventService(this.db).capture({
      userId: deployment.userId,
      appId: deployment.appId,
      eventName: 'deployment.action_requested',
      properties: {
        deploymentId: deployment.id,
        kind: input.kind
      }
    });

    return { ok: true };
  }

  async pullDeploymentAction(input: { deploymentId: string; token: string }) {
    const repository = new DeploymentRepository(this.db);
    const deployment = await repository.findDeploymentById(input.deploymentId);

    if (!deployment) {
      throw httpError(404, 'Deployment not found');
    }

    const meta = this.normalizeMeta(deployment.meta);
    const runtimeStatusReport = this.normalizeMeta(meta.runtimeStatusReport);
    let expectedToken = '';

    if (runtimeStatusReport.token) {
      try {
        const decrypted = decryptJson<{ token?: string }>(
          runtimeStatusReport.token,
          this.getEncryptionSecret()
        );
        expectedToken = normalizeString(decrypted.token);
      } catch {
        expectedToken = '';
      }
    }

    if (!expectedToken || expectedToken !== input.token) {
      throw httpError(401, 'Deployment action token is invalid');
    }

    const pendingAction = this.normalizeMeta(meta.pendingAction);
    if (normalizeString(pendingAction.id).length === 0) {
      return { action: null };
    }

    return {
      action: {
        id: normalizeString(pendingAction.id),
        kind: normalizeString(pendingAction.kind),
        requestedAt: normalizeString(pendingAction.requestedAt) || null
      }
    };
  }

  async completeDeploymentAction(input: {
    deploymentId: string;
    token: string;
    actionId: string;
    status: 'completed' | 'failed';
    message?: string;
  }) {
    const repository = new DeploymentRepository(this.db);
    const deployment = await repository.findDeploymentById(input.deploymentId);

    if (!deployment) {
      throw httpError(404, 'Deployment not found');
    }

    const meta = this.normalizeMeta(deployment.meta);
    const runtimeStatusReport = this.normalizeMeta(meta.runtimeStatusReport);
    let expectedToken = '';

    if (runtimeStatusReport.token) {
      try {
        const decrypted = decryptJson<{ token?: string }>(
          runtimeStatusReport.token,
          this.getEncryptionSecret()
        );
        expectedToken = normalizeString(decrypted.token);
      } catch {
        expectedToken = '';
      }
    }

    if (!expectedToken || expectedToken !== input.token) {
      throw httpError(401, 'Deployment action token is invalid');
    }

    const pendingAction = this.normalizeMeta(meta.pendingAction);
    if (normalizeString(pendingAction.id) !== input.actionId) {
      throw httpError(409, 'Deployment action does not match the current pending action');
    }

    meta.lastAction = {
      id: normalizeString(pendingAction.id),
      kind: normalizeString(pendingAction.kind),
      status: input.status,
      message: normalizeString(input.message),
      finishedAt: new Date().toISOString()
    };
    delete meta.pendingAction;

    const updated = await repository.updateDeployment(deployment.id, { meta });
    if (!updated) {
      throw httpError(500, 'Failed to complete deployment action');
    }

    await new EventService(this.db).capture({
      userId: deployment.userId,
      appId: deployment.appId,
      eventName: input.status === 'completed' ? 'deployment.action_completed' : 'deployment.action_failed',
      properties: {
        deploymentId: deployment.id,
        kind: normalizeString(pendingAction.kind),
        message: normalizeString(input.message)
      }
    });

    return { ok: true };
  }

  async deactivateDeployment(input: {
    deploymentId: string;
    userId: string;
  }) {
    const repository = new DeploymentRepository(this.db);
    const deployment = await repository.findDeploymentById(input.deploymentId);
    if (!deployment || deployment.userId !== input.userId) {
      throw httpError(404, 'Deployment not found');
    }

    await repository.expireActiveTokensByDeploymentId(deployment.id);

    const updated =
      deployment.status === 'active'
        ? await repository.updateDeployment(deployment.id, {
            status: 'inactive'
          })
        : deployment;

    if (!updated) {
      throw httpError(500, 'Failed to deactivate deployment');
    }

    await new EventService(this.db).capture({
      userId: input.userId,
      appId: deployment.appId,
      eventName: 'deployment.deactivated',
      properties: {
        deploymentId: deployment.id
      }
    });

    const [hydrated] = await this.hydrateDeployments([updated]);
    return hydrated;
  }
}
