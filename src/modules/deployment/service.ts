import { assertNoPendingSoftwareRefund } from '../billing/public';
import { HostingPurchases } from '../billing/public';
import { HostingServiceTerms } from './hosting-service';
import { HostingExecutionService } from './hosting-execution';
import { hostedPrefixSchema, hostingProfileSchema, serverIpSchema } from '@lingcoo/contracts';
import { HostingRepository } from './hosting';
import { DeploymentActionUseCases } from './action-use-cases';

import { type DeliverySettingSecrets, type DeliverySettingValues } from './public';

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
  normalizeString,
  normalizeValueRecord,
  normalizeSecretRecord,
  normalizeDomainValueRecord,
  type DeploymentRuntimeUpdatePolicy,
  normalizeDeploymentRuntimeUpdatePolicy,
} from './configuration';

export class DeploymentService extends DeploymentConfigurationUseCases {
  claimHostingJob(input: { nodeId: string; token: string }) {
    return new HostingExecutionService(this.capabilities, this.db, this.env).claim(input);
  }
  completeHostingJob(input: Parameters<HostingExecutionService['complete']>[0]) {
    return new HostingExecutionService(this.capabilities, this.db, this.env).complete(input);
  }

  async listUserDeployments(userId: string) {
    const rows = await new DeploymentRepository(this.db).listDeploymentsByUserId(userId);
    return {
      items: await this.hydrateDeployments(rows),
    };
  }

  async createDeployment(input: Parameters<DeploymentService['createDeploymentLocked']>[0]) {
    return this.db.transaction(async (tx) => {
      if (input.hostingPurchaseId)
        await new HostingPurchases(tx).lockForBinding(input.hostingPurchaseId, input.userId);
      await this.capabilities.createLicenseAccess(tx).lockEntitlementById(input.entitlementId);
      return new DeploymentService(this.capabilities, tx, this.env).createDeploymentLocked(input);
    });
  }

  private async createDeploymentLocked(input: {
    commandId?: string;
    userId: string;
    appCode: string;
    entitlementId: string;
    hostingPurchaseId?: string;
    allowUnpaidHosting?: boolean;
    label: string;
    environment: string;
    deploymentMode?: 'self_hosted' | 'managed';
    hostedPrefix?: string;
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
    await assertNoPendingSoftwareRefund(this.db, entitlement);
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
    const mode = input.deploymentMode ?? 'self_hosted';
    if (mode !== 'self_hosted' && mode !== 'managed') throw httpError(422, '不支持的部署方式');
    if (mode === 'self_hosted' && !serverIpSchema.safeParse(input.serverHost).success)
      throw httpError(422, '请填写有效的自有服务器 IP');
    if (mode === 'self_hosted' && input.hostedPrefix)
      throw httpError(422, '自有服务器不分配托管子域名');
    const hosting = new HostingRepository(this.db);
    let prefix: string | null = null;
    let hostname: string | null = null;
    let resources: { cpuMillis: number; memoryMb: number; diskMb: number } | null = null;
    let deploymentDomainValues = normalizeDomainValueRecord(input.domainValues);
    if (mode === 'self_hosted' && input.hostingPurchaseId)
      throw httpError(422, '自有服务器不消耗托管资格');
    if (mode === 'managed') {
      if (!input.hostingPurchaseId && !input.allowUnpaidHosting)
        throw httpError(422, '请选择已购买的托管资格');
      if (input.serverHost || input.installPath || Object.keys(deploymentDomainValues).length)
        throw httpError(422, '托管地址和服务器由平台分配');
      const profile = hostingProfileSchema.safeParse(
        this.normalizeMeta(selection.app.meta).hostingProfile,
      );
      if (
        !profile.success ||
        !manifest ||
        manifest.domainSlots.length !== 1 ||
        manifest.domainSlots[0]?.sourceField !== profile.data.domainField
      )
        throw httpError(422, '当前应用尚未配置可用的托管规格');
      await hosting.lockPool();
      prefix = await hosting.reservePrefix(
        input.hostedPrefix === undefined ? undefined : hostedPrefixSchema.parse(input.hostedPrefix),
      );
      hostname = `${prefix}.${this.env.HOSTING_DOMAIN_SUFFIX}`;
      const binding = this.readEntitlementBinding(entitlement);
      if (binding.boundDomain && binding.boundDomain !== hostname)
        throw httpError(409, '该授权已绑定其他域名，请先处理原有部署绑定');
      resources = profile.data.resources;
      deploymentDomainValues = { [profile.data.domainField]: hostname };
    }

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

    if (creationIssues[0]) {
      const firstIssue = creationIssues[0];
      throw httpError(422, `${firstIssue.label} is required`);
    }

    const deploymentMeta: Record<string, unknown> = {
      commandId: input.commandId,
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
      deploymentMode: mode,
      hostedPrefix: prefix,
      hostedDomain: hostname,
      hostingState: mode === 'managed' ? 'waiting_capacity' : null,
      hostingResources: resources,
      serverHost: input.serverHost ?? null,
      installPath:
        mode === 'managed'
          ? `/opt/lingcoo/instances/${prefix}`
          : (input.installPath ?? manifest?.installer.installPath ?? DEFAULT_INSTALLER.installPath),
      meta: deploymentMeta,
    });

    if (input.hostingPurchaseId) {
      const purchase = await new HostingPurchases(this.db).bind(
        input.hostingPurchaseId,
        deployment.id,
        selection.app.id,
        input.userId,
        input.entitlementId,
      );
      await new HostingServiceTerms(this.db).registerPurchase(
        deployment.id,
        input.userId,
        purchase,
      );
    }
    if (mode === 'managed') await hosting.allocate(deployment, this.capabilities.now());

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

    const created = await new DeploymentRepository(this.db).findDeploymentById(deployment.id);
    const [hydrated] = await this.hydrateDeployments([created ?? deployment]);
    if (!hydrated) throw new Error('Missing deployment projection');
    return hydrated;
  }

  async updateDeployment(input: Parameters<DeploymentService['updateDeploymentLocked']>[0]) {
    return this.db.transaction(async (tx) => {
      await new DeploymentRepository(tx).lockById(input.deploymentId);
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

    if (
      deployment.deploymentMode === 'managed' &&
      (input.serverHost !== undefined ||
        input.installPath !== undefined ||
        input.domainValues !== undefined)
    )
      throw httpError(422, '托管实例的服务器和域名由平台管理');

    const appRow = await createAppAccess(this.db).findAppById(deployment.appId);
    if (!appRow) {
      throw httpError(404, 'App not found');
    }

    const app = await this.capabilities.createAppService(this.db).getPublicApp(appRow.code);
    const { entitlement } = await this.loadDeploymentEntitlement(deployment);
    const manifest = this.readManifest(app);
    await assertNoPendingSoftwareRefund(this.db, entitlement);
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
      await new DeploymentRepository(tx).lockById(input.deploymentId);
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

    if (deployment.deploymentMode === 'managed')
      throw httpError(409, '托管实例由平台部署，不签发客户安装令牌');

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

    if (deployment.deploymentMode === 'managed') throw httpError(409, '托管实例不支持安装令牌兑换');
    const [hydrated] = await this.hydrateDeployments([deployment]);
    if (!hydrated) throw new Error('Missing deployment projection');
    const app = await this.capabilities
      .createAppService(this.db)
      .getPublicApp(hydrated.app?.code ?? '');
    const { entitlement } = await this.loadDeploymentEntitlement(deployment);
    await assertNoPendingSoftwareRefund(this.db, entitlement);
    const policy = this.readEntitlementDeploymentPolicy(entitlement);
    await this.ensureDeploymentReadyForTokenIssue({
      app,
      deployment,
    });
    await new DeploymentRepository(this.db).lockById(deployment.id);
    if (!(await repository.markTokenUsed(matched.id)))
      throw httpError(401, 'Deployment token is invalid or expired');
    const boundDeployment = await this.bindDeploymentDomainOnExchange({
      deployment,
      entitlementId: entitlement.id,
      policy,
    });
    const targetDeployment = boundDeployment;

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
      await new DeploymentRepository(tx).lockById(input.deploymentId);
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

    if (deployment.deploymentMode === 'managed')
      throw httpError(409, '托管实例尚未接入运行状态验证');
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
      ...(input.runtimeHealth ? { health: input.runtimeHealth } : {}),
    };

    const updated = await repository.updateDeployment(deployment.id, {
      meta,
      ...(input.runtimeHealth === 'ready' ? { lastDeployedAt: this.capabilities.now() } : {}),
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

  async deactivateDeployment(
    input: Parameters<DeploymentService['deactivateDeploymentLocked']>[0],
  ) {
    return this.db.transaction(async (tx) => {
      await new HostingRepository(tx).lockPool();
      await new DeploymentRepository(tx).lockById(input.deploymentId);
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

    if (
      deployment.deploymentMode === 'managed' &&
      !['waiting_capacity', 'pending_infrastructure', 'cancelled'].includes(
        deployment.hostingState ?? '',
      )
    )
      throw httpError(409, '已执行的托管部署需要先完成资源回收');
    await repository.expireActiveTokensByDeploymentId(deployment.id);

    const updated =
      deployment.status === 'active'
        ? await repository.updateDeployment(deployment.id, {
            status: 'inactive',
            ...(deployment.deploymentMode === 'managed'
              ? { hostingState: 'cancelled', hostingNodeId: null, serverHost: null }
              : {}),
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
  async refreshManagedAllocations() {
    return this.db.transaction(async (tx) => {
      const hosting = new HostingRepository(tx);
      await hosting.lockPool();
      const service = new DeploymentService(this.capabilities, tx, this.env);
      for (const row of await hosting.waiting()) {
        try {
          await service.loadDeploymentEntitlement(row);
        } catch (error) {
          if (
            error &&
            typeof error === 'object' &&
            'statusCode' in error &&
            [403, 409].includes(Number(error.statusCode))
          )
            continue;
          throw error;
        }
        await hosting.allocate(row, this.capabilities.now());
      }
    });
  }

  async retryManagedAllocation(input: { deploymentId: string; userId: string }) {
    return this.db.transaction(async (tx) => {
      const hosting = new HostingRepository(tx);
      await hosting.lockPool();
      const repository = new DeploymentRepository(tx);
      await repository.lockById(input.deploymentId);
      const row = await repository.findDeploymentById(input.deploymentId);
      if (!row || row.userId !== input.userId) throw httpError(404, 'Deployment not found');
      if (row.deploymentMode !== 'managed' || row.status !== 'active')
        throw httpError(409, '该实例不能申请托管分配');
      const service = new DeploymentService(this.capabilities, tx, this.env);
      await service.loadDeploymentEntitlement(row);
      if (row.hostingState === 'failed') {
        await repository.updateDeployment(row.id, { hostingState: 'deploying' });
      } else {
        await hosting.allocate(row, this.capabilities.now());
      }
      const updated = await repository.findDeploymentById(row.id);
      return (await service.hydrateDeployments([updated ?? row]))[0];
    });
  }
  requestDeploymentAction(
    input: Parameters<DeploymentActionUseCases['requestDeploymentAction']>[0],
  ) {
    return new DeploymentActionUseCases(this.capabilities, this.db, () =>
      this.getEncryptionSecret(),
    ).requestDeploymentAction(input);
  }
  pullDeploymentAction(input: Parameters<DeploymentActionUseCases['pullDeploymentAction']>[0]) {
    return new DeploymentActionUseCases(this.capabilities, this.db, () =>
      this.getEncryptionSecret(),
    ).pullDeploymentAction(input);
  }
  completeDeploymentAction(
    input: Parameters<DeploymentActionUseCases['completeDeploymentAction']>[0],
  ) {
    return new DeploymentActionUseCases(this.capabilities, this.db, () =>
      this.getEncryptionSecret(),
    ).completeDeploymentAction(input);
  }
}
