import { isEffectiveEntitlement, loadDeploymentEntitlement } from './entitlement-policy';
import { normalizeDeploymentMeta } from './record-utils';
import { hydrateDeploymentViews } from './projection';
import { assembleDeploymentBootstrap, buildExchangeCurl } from './bootstrap-payload';

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

import { type LicenseRepositoryPort as LicenseRepository } from '../license/public';
import { DeploymentRepository } from './repository';
import {
  type DeploymentAppRecord,
  LEGACY_APP_DEFAULT_VALUE_KEYS,
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
    return isEffectiveEntitlement(entitlement);
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
    deployment: NonNullable<Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>>,
  ) {
    return loadDeploymentEntitlement(this.capabilities.createLicenseAccess(this.db), deployment);
  }

  protected async hydrateDeployments(
    rows: Awaited<ReturnType<DeploymentRepository['listDeploymentsByUserId']>>,
  ) {
    return hydrateDeploymentViews(rows, {
      db: this.db,
      capabilities: this.capabilities,
      readManifest: this.readManifest.bind(this),
      readDeploymentInputValues: this.readDeploymentInputValues.bind(this),
      filterDomainValuesForManifest: this.filterDomainValuesForManifest.bind(this),
      readDeploymentDomainValues: this.readDeploymentDomainValues.bind(this),
      readDeploymentInputSecrets: this.readDeploymentInputSecrets.bind(this),
      readDeploymentRuntimeUpdatePolicy: this.readDeploymentRuntimeUpdatePolicy.bind(this),
      normalizeMeta: this.normalizeMeta.bind(this),
      readEntitlementDeploymentPolicy: this.readEntitlementDeploymentPolicy.bind(this),
      readEntitlementBinding: this.readEntitlementBinding.bind(this),
      getSourceFieldValue: this.getSourceFieldValue.bind(this),
      buildDeploymentDisplayEnvDefaults: this.buildDeploymentDisplayEnvDefaults.bind(this),
    });
  }

  protected createPlainToken() {
    return `fddp_${randomBytes(24).toString('base64url')}`;
  }

  protected createStatusReportToken() {
    return `fdsr_${randomBytes(24).toString('base64url')}`;
  }

  protected normalizeMeta(meta: unknown) {
    return normalizeDeploymentMeta(meta);
  }

  protected async ensureDeploymentStatusReportAuth(
    deployment: NonNullable<Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>>,
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
        .map(
          ([key, value]) =>
            [key, typeof value === 'boolean' ? String(value) : normalizeString(value)] as const,
        )
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
    deployment: NonNullable<Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>>,
  ): DeploymentRuntimeUpdatePolicy {
    const meta = this.normalizeMeta(deployment?.meta);
    const runtimeUpdate = this.normalizeMeta(meta.runtimeUpdate);
    return normalizeDeploymentRuntimeUpdatePolicy(runtimeUpdate.policy);
  }

  protected readDeploymentInputValues(
    deployment: NonNullable<Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>>,
  ) {
    const meta = this.normalizeMeta(deployment?.meta);
    const inputs = this.normalizeMeta(meta.deliveryInputs);
    return normalizeValueRecord(inputs.values);
  }

  protected readDeploymentInputSecrets(
    deployment: NonNullable<Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>>,
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
    deployment: NonNullable<Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>>,
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
    deployment: NonNullable<Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>>;
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
    deployment: NonNullable<Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>>;
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
    deployment: NonNullable<Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>>;
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
    deployment: NonNullable<Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>>,
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
    deployment: NonNullable<Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>>;
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
