import { assembleDeploymentBootstrap, buildExchangeCurl } from './bootstrap-payload';
import { queryBatch } from '../../db/query-batch';
import { pickDeploymentDependencies, type DeploymentDependencies } from './dependencies';
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
} from './public';
import {
  getDomainBindingValue,
  normalizeDeploymentPolicy,
  type DeploymentPolicy,
} from '../../lib/deployment-policy';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { decryptJson, encryptJson, getEncryptionKeys } from '../../lib/settings-crypto';
import { createAppAccess } from '../app/public';
import { createAuthAccess } from '../auth/public';
import { type LicenseRepositoryPort as LicenseRepository } from '../license/public';
import { DeploymentRepository } from './repository';
import {
  type DeploymentAppRecord,
  LEGACY_APP_DEFAULT_VALUE_KEYS,
  WORDPRESS_ASSET_RELEASE_KEYS,
  AVAILABLE_WORDPRESS_ASSET_RELEASE_KEYS,
  type DeploymentActionKind,
  normalizeString,
  normalizeBoolean,
  normalizeValueRecord,
  normalizeSecretRecord,
  normalizeDomainValueRecord,
  type DeploymentRuntimeUpdatePolicy,
  type DeploymentBindingState,
  type DeploymentConfigIssue,
  normalizeHostname,
  isDeploymentDomainBindingSource,
  getDomainBindingSourceLabel,
  normalizeDeploymentRuntimeUpdatePolicy,
} from './configuration-model';
export * from './configuration-model';

export class DeploymentConfigurationUseCases {
  protected readonly capabilities: DeploymentDependencies;
  constructor(
    capabilities: DeploymentDependencies,
    protected readonly db: DbExecutor,
    protected readonly env: AppEnv,
  ) {
    this.capabilities = pickDeploymentDependencies(capabilities);
  }
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
    const [apps, users, tokens, entitlements] = await queryBatch(this.db, [
      () => createAppAccess(this.db).listAppsByIds(appIds),
      () => createAuthAccess(this.db).listUsersByIds(userIds),
      () =>
        new DeploymentRepository(this.db).listTokensByDeploymentIds(rows.map((item) => item.id)),
      () => this.capabilities.createLicenseAccess(this.db).listEntitlementsByIds(entitlementIds),
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

    return queryBatch(
      this.db,
      rows.map((row) => async () => {
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

    return assembleDeploymentBootstrap({
      deployment: statusReportAuth.deployment,
      manifest,
      appDefaults,
      deliverySettings,
      deploymentValues,
      deploymentSecrets,
      policy,
      updatePolicy,
      statusReportToken: statusReportAuth.token,
      publicBaseUrl: this.env.PUBLIC_BASE_URL,
      token: input.token,
      sourceValue: (field) => this.getSourceFieldValue(input.deployment, field),
      resolveField: (values) => this.resolveManifestFieldValue(values),
    });
  }

  protected buildExchangeCurl(token: string) {
    return buildExchangeCurl(token, this.env.PUBLIC_BASE_URL);
  }
}
