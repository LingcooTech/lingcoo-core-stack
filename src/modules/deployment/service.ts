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
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/security';
import { decryptJson, encryptJson } from '../../lib/settings-crypto';
import { AppRepository } from '../app/repository';
import { AppService } from '../app/service';
import { AuthRepository } from '../auth/repository';
import { EventService } from '../event/service';
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

  private async hydrateDeployments(
    rows: Awaited<ReturnType<DeploymentRepository['listDeploymentsByUserId']>>
  ) {
    const appIds = [...new Set(rows.map((item) => item.appId))];
    const userIds = [...new Set(rows.map((item) => item.userId))];
    const [apps, users, tokens] = await Promise.all([
      new AppRepository(this.db).listAppsByIds(appIds),
      new AuthRepository(this.db).listUsersByIds(userIds),
      new DeploymentRepository(this.db).listTokensByDeploymentIds(rows.map((item) => item.id))
    ]);

    const appMap = new Map(apps.map((item) => [item.id, item]));
    const userMap = new Map(users.map((item) => [item.id, item]));
    const latestTokenMap = new Map<string, (typeof tokens)[number]>();
    for (const token of tokens) {
      if (!latestTokenMap.has(token.deploymentId)) {
        latestTokenMap.set(token.deploymentId, token);
      }
    }

    return rows.map((row) => {
      const app = appMap.get(row.appId) ?? null;
      const user = userMap.get(row.userId) ?? null;
      const token = latestTokenMap.get(row.id) ?? null;

      return {
        ...row,
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
    });
  }

  private createPlainToken() {
    return `fddp_${randomBytes(24).toString('base64url')}`;
  }

  private normalizeMeta(meta: unknown) {
    return meta && typeof meta === 'object' && !Array.isArray(meta)
      ? { ...(meta as Record<string, unknown>) }
      : {};
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
    token?: string;
  }) {
    const manifest = this.readManifest(input.app);
    const appDefaults = this.readLegacyDeploymentDefaults(input.app);
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

    const exchangeUrl = new URL('/v1/deployments/bootstrap/exchange', this.env.PUBLIC_BASE_URL).toString();

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
    label: string;
    environment: string;
    serverHost?: string;
    primaryDomain?: string;
    adminDomain?: string;
    wsDomain?: string;
    installPath?: string;
    values?: DeliverySettingValues;
    secrets?: DeliverySettingSecrets;
  }) {
    const selection = await this.resolveDeployableApp({
      userId: input.userId,
      appCode: input.appCode
    });

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

    const deploymentMeta: Record<string, unknown> = {
      appCode: selection.app.code
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

    const app = await new AppService(this.db).getPublicApp(
      (await new AppRepository(this.db).findAppById(deployment.appId))?.code ?? ''
    );
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

    const deployment = await new DeploymentRepository(this.db).findDeploymentById(matched.deploymentId);
    if (!deployment) {
      throw httpError(404, 'Deployment not found');
    }

    const [hydrated] = await this.hydrateDeployments([deployment]);
    const app = await new AppService(this.db).getPublicApp(hydrated.app?.code ?? '');
    await new DeploymentRepository(this.db).markTokenUsed(matched.id);
    await new DeploymentRepository(this.db).updateDeployment(deployment.id, {
      lastDeployedAt: new Date()
    });

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
      deployment: hydrated,
      bootstrap: await this.buildBootstrapPayload({
        app,
        deployment,
        token
      })
    };
  }
}
