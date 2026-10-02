import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';

import {
  type DeliverySettingSecrets,
  type DeliverySettingValues,
} from '../../lib/delivery-settings';

import { httpError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/security';
import { decryptJson, encryptJson } from '../../lib/settings-crypto';
import { createAppAccess } from '../app/public';

import { DeploymentRepository } from './repository';
import {
  DeploymentConfigurationUseCases,
  DEFAULT_INSTALLER,
  AVAILABLE_WORDPRESS_ASSET_RELEASE_KEYS,
  type DeploymentStatusReportPayload,
  type DeploymentActionKind,
  normalizeString,
  normalizeValueRecord,
  normalizeSecretRecord,
  normalizeDomainValueRecord,
  type DeploymentRuntimeUpdatePolicy,
  normalizeDeploymentRuntimeUpdatePolicy,
} from './configuration';

export class DeploymentService extends DeploymentConfigurationUseCases {
  async listUserDeployments(userId: string) {
    const rows = await new DeploymentRepository(this.db).listDeploymentsByUserId(userId);
    return {
      items: await this.hydrateDeployments(rows),
    };
  }

  async createDeployment(input: Parameters<DeploymentService['createDeploymentLocked']>[0]) {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from entitlements where id = ${input.entitlementId} for update`,
      );
      return new DeploymentService(this.capabilities, tx, this.env).createDeploymentLocked(input);
    });
  }

  private async createDeploymentLocked(input: {
    userId: string;
    appCode: string;
    entitlementId: string;
    label: string;
    environment: string;
    serverHost?: string;
    installPath?: string;
    updatePolicy?: DeploymentRuntimeUpdatePolicy;
    domainValues?: Record<string, string>;
    values?: DeliverySettingValues;
    secrets?: DeliverySettingSecrets;
  }) {
    const selection = await this.resolveDeployableApp({
      userId: input.userId,
      appCode: input.appCode,
    });
    const { entitlement, plan } = await this.resolveDeploymentEntitlement({
      userId: input.userId,
      appId: selection.app.id,
      entitlementId: input.entitlementId,
    });
    const policy = this.readEntitlementDeploymentPolicy(entitlement);
    const activeCount = await new DeploymentRepository(
      this.db,
    ).countActiveDeploymentsByEntitlementId({
      entitlementId: entitlement.id,
    });

    if (activeCount >= policy.maxActiveDeployments) {
      throw httpError(
        409,
        `Active deployment limit reached for this entitlement (${policy.maxActiveDeployments}). Deactivate an existing deployment or buy another entitlement before creating a new one.`,
      );
    }

    const manifest = this.readManifest(selection.app);
    const deploymentValues = normalizeValueRecord(input.values);
    const deploymentSecrets = normalizeSecretRecord(input.secrets);
    const deploymentDomainValues = normalizeDomainValueRecord(input.domainValues);

    this.validateDeploymentInputs({
      manifest,
      values: deploymentValues,
      secrets: deploymentSecrets,
      domainValues: deploymentDomainValues,
    });

    const creationIssues = this.collectDeploymentConfigIssues({
      manifest,
      values: deploymentValues,
      secrets: deploymentSecrets,
      domainValues: deploymentDomainValues,
      policy,
    });

    if (creationIssues.length > 0) {
      const firstIssue = creationIssues[0];
      throw httpError(422, `${firstIssue.label} is required`);
    }

    const deploymentMeta: Record<string, unknown> = {
      appCode: selection.app.code,
      planCode: plan.code,
      runtimeUpdate: {
        policy: normalizeDeploymentRuntimeUpdatePolicy(input.updatePolicy),
      },
      deliveryDomains: {
        values: deploymentDomainValues,
      },
    };

    if (Object.keys(deploymentValues).length > 0 || Object.keys(deploymentSecrets).length > 0) {
      deploymentMeta.deliveryInputs = {
        values: deploymentValues,
        secrets:
          Object.keys(deploymentSecrets).length > 0
            ? encryptJson(deploymentSecrets, this.getEncryptionSecret())
            : undefined,
      };
    }

    const deployment = await new DeploymentRepository(this.db).createDeployment({
      userId: input.userId,
      appId: selection.app.id,
      entitlementId: entitlement.id,
      label: input.label,
      environment: input.environment,
      serverHost: input.serverHost ?? null,
      installPath:
        input.installPath ?? manifest?.installer.installPath ?? DEFAULT_INSTALLER.installPath,
      meta: deploymentMeta,
    });

    await this.capabilities.createEventService(this.db).capture({
      userId: input.userId,
      appId: selection.app.id,
      eventName: 'deployment.created',
      properties: {
        deploymentId: deployment.id,
        appCode: selection.app.code,
        environment: deployment.environment,
      },
    });

    const [hydrated] = await this.hydrateDeployments([deployment]);
    return hydrated;
  }

  async updateDeployment(input: Parameters<DeploymentService['updateDeploymentLocked']>[0]) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select id from deployments where id = ${input.deploymentId} for update`);
      return new DeploymentService(this.capabilities, tx, this.env).updateDeploymentLocked(input);
    });
  }

  private async updateDeploymentLocked(input: {
    deploymentId: string;
    userId: string;
    label?: string;
    environment?: string;
    serverHost?: string;
    installPath?: string;
    updatePolicy?: DeploymentRuntimeUpdatePolicy;
    domainValues?: Record<string, string>;
    values?: DeliverySettingValues;
    secrets?: DeliverySettingSecrets;
  }) {
    const repository = new DeploymentRepository(this.db);
    const deployment = await repository.findDeploymentById(input.deploymentId);
    if (!deployment || deployment.userId !== input.userId) {
      throw httpError(404, 'Deployment not found');
    }

    const appRow = await createAppAccess(this.db).findAppById(deployment.appId);
    if (!appRow) {
      throw httpError(404, 'App not found');
    }

    const app = await this.capabilities.createAppService(this.db).getPublicApp(appRow.code);
    const { entitlement } = await this.loadDeploymentEntitlement(deployment);
    const manifest = this.readManifest(app);
    const policy = this.readEntitlementDeploymentPolicy(entitlement);
    const binding = this.readEntitlementBinding(entitlement);
    const currentValues = this.readDeploymentInputValues(deployment);
    const currentSecrets = this.readDeploymentInputSecrets(deployment);
    const nextValues = {
      ...currentValues,
      ...normalizeValueRecord(input.values),
    };
    const nextSecrets = {
      ...currentSecrets,
      ...normalizeSecretRecord(input.secrets),
    };
    const currentDomainValues = this.filterDomainValuesForManifest(
      manifest,
      this.readDeploymentDomainValues(deployment),
    );
    const requestedDomainValues = normalizeDomainValueRecord(input.domainValues);
    const nextDomainValues = {
      ...currentDomainValues,
      ...requestedDomainValues,
    };

    this.validateDeploymentInputs({
      manifest,
      values: nextValues,
      secrets: nextSecrets,
      domainValues: nextDomainValues,
    });

    this.assertDomainBindingEditable({
      deployment,
      policy,
      binding,
      requestedDomainValues,
    });

    const nextMeta = this.normalizeMeta(deployment.meta);
    const nextRuntimeUpdate = this.normalizeMeta(nextMeta.runtimeUpdate);
    nextRuntimeUpdate.policy = normalizeDeploymentRuntimeUpdatePolicy(
      typeof input.updatePolicy === 'string' ? input.updatePolicy : nextRuntimeUpdate.policy,
    );
    nextMeta.runtimeUpdate = nextRuntimeUpdate;
    nextMeta.deliveryDomains = {
      values: nextDomainValues,
    };

    if (Object.keys(nextValues).length > 0 || Object.keys(nextSecrets).length > 0) {
      nextMeta.deliveryInputs = {
        values: nextValues,
        secrets:
          Object.keys(nextSecrets).length > 0
            ? encryptJson(nextSecrets, this.getEncryptionSecret())
            : undefined,
      };
    } else {
      delete nextMeta.deliveryInputs;
    }

    const updated = await repository.updateDeployment(deployment.id, {
      label: input.label?.trim() || deployment.label,
      environment: input.environment?.trim() || deployment.environment,
      serverHost:
        typeof input.serverHost === 'string'
          ? input.serverHost.trim() || null
          : deployment.serverHost,
      installPath: input.installPath?.trim() || deployment.installPath,
      meta: nextMeta,
    });

    if (!updated) {
      throw httpError(500, 'Failed to update deployment');
    }

    await this.capabilities.createEventService(this.db).capture({
      userId: input.userId,
      appId: deployment.appId,
      eventName: 'deployment.updated',
      properties: {
        deploymentId: deployment.id,
      },
    });

    const [hydrated] = await this.hydrateDeployments([updated]);
    return hydrated;
  }

  async issueDeploymentToken(
    input: Parameters<DeploymentService['issueDeploymentTokenLocked']>[0],
  ) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select id from deployments where id = ${input.deploymentId} for update`);
      return new DeploymentService(this.capabilities, tx, this.env).issueDeploymentTokenLocked(
        input,
      );
    });
  }

  private async issueDeploymentTokenLocked(input: {
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
      throw httpError(
        409,
        'Deployment is inactive. Reactivate or create a new deployment before issuing a token.',
      );
    }

    const app = await this.capabilities
      .createAppService(this.db)
      .getPublicApp((await createAppAccess(this.db).findAppById(deployment.appId))?.code ?? '');
    await this.ensureDeploymentReadyForTokenIssue({
      app,
      deployment,
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
        exchangeUrl: new URL(
          '/v1/deployments/bootstrap/exchange',
          this.env.PUBLIC_BASE_URL,
        ).toString(),
      },
    });

    await repository.updateDeployment(deployment.id, {
      lastTokenIssuedAt: this.capabilities.now(),
    });

    await this.capabilities.createEventService(this.db).capture({
      userId: input.userId,
      appId: deployment.appId,
      eventName: 'deployment.token_issued',
      properties: {
        deploymentId: deployment.id,
        tokenId: token.id,
        expiresAt: expiresAt.toISOString(),
      },
    });

    const bootstrap = await this.buildBootstrapPayload({
      app,
      deployment,
      token: plainToken,
    });

    return {
      deploymentId: deployment.id,
      tokenId: token.id,
      tokenHint: token.tokenHint,
      token: plainToken,
      exchangeUrl: bootstrap.exchangeUrl,
      exchangeCurl: this.buildExchangeCurl(plainToken),
      remoteInstallCommand: bootstrap.remoteInstallCommand,
      expiresAt,
    };
  }

  async exchangeBootstrapToken(token: string) {
    return this.db.transaction((tx) =>
      new DeploymentService(this.capabilities, tx, this.env).exchangeBootstrapTokenLocked(token),
    );
  }

  private async exchangeBootstrapTokenLocked(token: string) {
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
    const app = await this.capabilities
      .createAppService(this.db)
      .getPublicApp(hydrated.app?.code ?? '');
    const { entitlement } = await this.loadDeploymentEntitlement(deployment);
    const policy = this.readEntitlementDeploymentPolicy(entitlement);
    await this.ensureDeploymentReadyForTokenIssue({
      app,
      deployment,
    });
    await this.db.execute(sql`select id from deployments where id = ${deployment.id} for update`);
    if (!(await repository.markTokenUsed(matched.id)))
      throw httpError(401, 'Deployment token is invalid or expired');
    const boundDeployment = await this.bindDeploymentDomainOnExchange({
      deployment,
      entitlementId: entitlement.id,
      policy,
    });
    const updatedDeployment = await repository.updateDeployment(boundDeployment.id, {
      lastDeployedAt: this.capabilities.now(),
    });
    const targetDeployment = updatedDeployment ?? boundDeployment;

    await this.capabilities.createEventService(this.db).capture({
      userId: deployment.userId,
      appId: deployment.appId,
      eventName: 'deployment.token_exchanged',
      properties: {
        deploymentId: deployment.id,
        tokenId: matched.id,
      },
    });

    return {
      deployment: (await this.hydrateDeployments([targetDeployment]))[0],
      bootstrap: await this.buildBootstrapPayload({
        app,
        deployment: targetDeployment,
        token,
      }),
    };
  }

  async reportDeploymentStatus(
    input: Parameters<DeploymentService['reportDeploymentStatusLocked']>[0],
  ) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select id from deployments where id = ${input.deploymentId} for update`);
      return new DeploymentService(this.capabilities, tx, this.env).reportDeploymentStatusLocked(
        input,
      );
    });
  }

  private async reportDeploymentStatusLocked(input: DeploymentStatusReportPayload) {
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
          this.getEncryptionSecret(),
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
    const runtimeAssetsUpdate = this.normalizeMeta(meta.runtimeAssetsUpdate);
    const previousRuntimeAssetsAvailable = this.normalizeMeta(runtimeAssetsUpdate.available);
    const hadAvailableRuntimeUpdate =
      normalizeString(runtimeUpdate.availableFrontendImage).length > 0 ||
      normalizeString(runtimeUpdate.availableWebsocketImage).length > 0 ||
      Object.values(previousRuntimeAssetsAvailable).some(
        (value) => normalizeString(value).length > 0,
      );
    if (input.runtimeAssets) {
      if (typeof input.runtimeAssets.current !== 'undefined') {
        runtimeAssetsUpdate.current = input.runtimeAssets.current ?? {};
      }
      if (typeof input.runtimeAssets.available !== 'undefined') {
        runtimeAssetsUpdate.available = input.runtimeAssets.available ?? {};
      }
      if (typeof input.runtimeAssets.offeredAt !== 'undefined') {
        runtimeAssetsUpdate.offeredAt = input.runtimeAssets.offeredAt ?? '';
      }
      if (typeof input.runtimeAssets.appliedAt !== 'undefined') {
        runtimeAssetsUpdate.appliedAt = input.runtimeAssets.appliedAt ?? '';
      }
    }
    meta.runtimeAssetsUpdate = runtimeAssetsUpdate;
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
      normalizeString(runtimeUpdate.availableWebsocketImage).length > 0 ||
      Object.values(this.normalizeMeta(runtimeAssetsUpdate.available)).some(
        (value) => normalizeString(value).length > 0,
      );

    const wordpressAssetsUpdate = this.normalizeMeta(meta.wordpressAssetsUpdate);
    const previousWordpressAvailable = this.normalizeMeta(wordpressAssetsUpdate.available);
    const hadAvailableWordpressUpdate =
      Object.values(previousWordpressAvailable).some(
        (value) => normalizeString(value).length > 0,
      ) ||
      AVAILABLE_WORDPRESS_ASSET_RELEASE_KEYS.some(
        (key) => normalizeString(wordpressAssetsUpdate[key]).length > 0,
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
        (key) => normalizeString(wordpressAssetsUpdate[key]).length > 0,
      );

    meta.runtimeStatusReport = {
      ...runtimeStatusReport,
      lastReportedAt: this.capabilities.now().toISOString(),
    };

    const updated = await repository.updateDeployment(deployment.id, {
      meta,
    });

    if (!updated) {
      throw httpError(500, 'Failed to store deployment status report');
    }

    await this.capabilities.createEventService(this.db).capture({
      userId: deployment.userId,
      appId: deployment.appId,
      eventName: 'deployment.status_reported',
      properties: {
        deploymentId: deployment.id,
      },
    });

    if (!hadAvailableRuntimeUpdate && hasAvailableRuntimeUpdate) {
      await this.capabilities.createEventService(this.db).capture({
        userId: deployment.userId,
        appId: deployment.appId,
        eventName: 'deployment.runtime_update_available',
        properties: {
          deploymentId: deployment.id,
        },
      });
    }

    if (!hadAvailableWordpressUpdate && hasAvailableWordpressUpdate) {
      await this.capabilities.createEventService(this.db).capture({
        userId: deployment.userId,
        appId: deployment.appId,
        eventName: 'deployment.wordpress_update_available',
        properties: {
          deploymentId: deployment.id,
        },
      });
    }

    return { ok: true };
  }

  async requestDeploymentAction(
    input: Parameters<DeploymentService['requestDeploymentActionLocked']>[0],
  ) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select id from deployments where id = ${input.deploymentId} for update`);
      return new DeploymentService(this.capabilities, tx, this.env).requestDeploymentActionLocked(
        input,
      );
    });
  }

  private async requestDeploymentActionLocked(input: {
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
    const runtimeAssetsUpdate = this.normalizeMeta(meta.runtimeAssetsUpdate);
    const wordpressAssetsUpdate = this.normalizeMeta(meta.wordpressAssetsUpdate);

    if (input.kind === 'apply_runtime_images' || input.kind === 'ignore_runtime_images') {
      const hasAvailableRuntimeImage =
        normalizeString(runtimeUpdate.availableFrontendImage).length > 0 ||
        normalizeString(runtimeUpdate.availableWebsocketImage).length > 0 ||
        Object.values(this.normalizeMeta(runtimeAssetsUpdate.available)).some(
          (value) => normalizeString(value).length > 0,
        );
      if (!hasAvailableRuntimeImage) {
        throw httpError(409, 'No available runtime image update to process');
      }
    }

    if (input.kind === 'apply_wordpress_assets' || input.kind === 'ignore_wordpress_assets') {
      const hasAvailableWordpressAssets =
        Object.values(this.normalizeMeta(wordpressAssetsUpdate.available)).some(
          (value) => normalizeString(value).length > 0,
        ) ||
        AVAILABLE_WORDPRESS_ASSET_RELEASE_KEYS.some(
          (key) => normalizeString(wordpressAssetsUpdate[key]).length > 0,
        );
      if (!hasAvailableWordpressAssets) {
        throw httpError(409, 'No available WordPress asset update to process');
      }
    }

    if (normalizeString(this.normalizeMeta(meta.pendingAction).id))
      throw httpError(409, 'A deployment action is already pending');
    meta.pendingAction = {
      id: `fdda_${randomBytes(12).toString('base64url')}`,
      kind: input.kind,
      requestedAt: this.capabilities.now().toISOString(),
      requestedByUserId: input.userId,
    };

    const updated = await repository.updateDeployment(deployment.id, { meta });
    if (!updated) {
      throw httpError(500, 'Failed to queue deployment action');
    }

    await this.capabilities.createEventService(this.db).capture({
      userId: deployment.userId,
      appId: deployment.appId,
      eventName: 'deployment.action_requested',
      properties: {
        deploymentId: deployment.id,
        kind: input.kind,
      },
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
          this.getEncryptionSecret(),
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
        requestedAt: normalizeString(pendingAction.requestedAt) || null,
      },
    };
  }

  async completeDeploymentAction(
    input: Parameters<DeploymentService['completeDeploymentActionLocked']>[0],
  ) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select id from deployments where id = ${input.deploymentId} for update`);
      return new DeploymentService(this.capabilities, tx, this.env).completeDeploymentActionLocked(
        input,
      );
    });
  }

  private async completeDeploymentActionLocked(input: {
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
          this.getEncryptionSecret(),
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
    const lastAction = this.normalizeMeta(meta.lastAction);
    if (
      !normalizeString(pendingAction.id) &&
      normalizeString(lastAction.id) === input.actionId &&
      lastAction.status === input.status
    )
      return { ok: true };
    if (normalizeString(pendingAction.id) !== input.actionId) {
      throw httpError(409, 'Deployment action does not match the current pending action');
    }

    meta.lastAction = {
      id: normalizeString(pendingAction.id),
      kind: normalizeString(pendingAction.kind),
      status: input.status,
      message: normalizeString(input.message),
      finishedAt: this.capabilities.now().toISOString(),
    };
    delete meta.pendingAction;

    const updated = await repository.updateDeployment(deployment.id, { meta });
    if (!updated) {
      throw httpError(500, 'Failed to complete deployment action');
    }

    await this.capabilities.createEventService(this.db).capture({
      userId: deployment.userId,
      appId: deployment.appId,
      eventName:
        input.status === 'completed' ? 'deployment.action_completed' : 'deployment.action_failed',
      properties: {
        deploymentId: deployment.id,
        kind: normalizeString(pendingAction.kind),
        message: normalizeString(input.message),
      },
    });

    return { ok: true };
  }

  async deactivateDeployment(
    input: Parameters<DeploymentService['deactivateDeploymentLocked']>[0],
  ) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select id from deployments where id = ${input.deploymentId} for update`);
      return new DeploymentService(this.capabilities, tx, this.env).deactivateDeploymentLocked(
        input,
      );
    });
  }

  private async deactivateDeploymentLocked(input: { deploymentId: string; userId: string }) {
    const repository = new DeploymentRepository(this.db);
    const deployment = await repository.findDeploymentById(input.deploymentId);
    if (!deployment || deployment.userId !== input.userId) {
      throw httpError(404, 'Deployment not found');
    }

    await repository.expireActiveTokensByDeploymentId(deployment.id);

    const updated =
      deployment.status === 'active'
        ? await repository.updateDeployment(deployment.id, {
            status: 'inactive',
          })
        : deployment;

    if (!updated) {
      throw httpError(500, 'Failed to deactivate deployment');
    }

    await this.capabilities.createEventService(this.db).capture({
      userId: input.userId,
      appId: deployment.appId,
      eventName: 'deployment.deactivated',
      properties: {
        deploymentId: deployment.id,
      },
    });

    const [hydrated] = await this.hydrateDeployments([updated]);
    return hydrated;
  }
}
