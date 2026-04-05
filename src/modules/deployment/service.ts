import { randomBytes } from 'node:crypto';

import type { DbClient } from '../../db/types';
import { DeliverySettingsService } from '../../lib/delivery-settings';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/security';
import { AppService } from '../app/service';
import { AppRepository } from '../app/repository';
import { AuthRepository } from '../auth/repository';
import { EventService } from '../event/service';
import { LicenseRepository } from '../license/repository';
import { DeploymentRepository } from './repository';

type DeploymentAppRecord = Awaited<ReturnType<AppService['getPublicApp']>>;

export class DeploymentService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv
  ) {}

  private async resolveDeployableProduct(input: {
    userId: string;
    appCode: string;
    productCode?: string;
  }) {
    const app = await new AppService(this.db).getPublicApp(input.appCode);

    if (app.type !== 'service' && app.type !== 'web_app') {
      throw httpError(422, 'This app is not configured as a deployable system product');
    }

    const entitlementView = await new AppService(this.db).listUserEntitlementsForApp(input.appCode, input.userId);
    const entitledProductCodes = new Set(entitlementView.summary.map((item) => item.productCode));
    const deployableProducts = app.products.filter((product) => entitledProductCodes.has(product.code));

    if (deployableProducts.length === 0) {
      throw httpError(403, 'You do not have an active deployment entitlement for this app');
    }

    if (input.productCode) {
      const matched = deployableProducts.find((product) => product.code === input.productCode);
      if (!matched) {
        throw httpError(404, 'The selected product is not deployable for this account');
      }

      return {
        app,
        product: matched,
        entitlementSummary: entitlementView.summary.filter((item) => item.productCode === matched.code)
      };
    }

    if (deployableProducts.length > 1) {
      throw httpError(422, 'productCode is required because this app has multiple deployable products');
    }

    return {
      app,
      product: deployableProducts[0],
      entitlementSummary: entitlementView.summary.filter((item) => item.productCode === deployableProducts[0].code)
    };
  }

  private async hydrateDeployments(rows: Awaited<ReturnType<DeploymentRepository['listDeploymentsByUserId']>>) {
    const appIds = [...new Set(rows.map((item) => item.appId))];
    const productIds = [...new Set(rows.map((item) => item.productId))];
    const userIds = [...new Set(rows.map((item) => item.userId))];
    const [apps, products, users, tokens] = await Promise.all([
      new AppRepository(this.db).listAppsByIds(appIds),
      new LicenseRepository(this.db).listProductsByIds(productIds),
      new AuthRepository(this.db).listUsersByIds(userIds),
      new DeploymentRepository(this.db).listTokensByDeploymentIds(rows.map((item) => item.id))
    ]);

    const appMap = new Map(apps.map((item) => [item.id, item]));
    const productMap = new Map(products.map((item) => [item.id, item]));
    const userMap = new Map(users.map((item) => [item.id, item]));
    const latestTokenMap = new Map<string, (typeof tokens)[number]>();
    for (const token of tokens) {
      if (!latestTokenMap.has(token.deploymentId)) {
        latestTokenMap.set(token.deploymentId, token);
      }
    }

    return rows.map((row) => {
      const app = appMap.get(row.appId) ?? null;
      const product = productMap.get(row.productId) ?? null;
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
        product: product
          ? { id: product.id, code: product.code, name: product.name, type: product.type }
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
    return meta && typeof meta === 'object' && !Array.isArray(meta) ? { ...(meta as Record<string, unknown>) } : {};
  }

  private readDeploymentDefaults(app: DeploymentAppRecord) {
    const meta = this.normalizeMeta(app.meta);
    const raw = this.normalizeMeta(meta.deploymentDefaults);
    const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
    const bool = (value: unknown) => (typeof value === 'boolean' ? value : undefined);

    return {
      repoUrl: text(raw.repoUrl),
      repoBranch: text(raw.repoBranch),
      frontendImage: text(raw.frontendImage),
      websocketImage: text(raw.websocketImage),
      letsencryptEmail: text(raw.letsencryptEmail),
      wordpressFetchReleaseAssets: bool(raw.wordpressFetchReleaseAssets),
      wordpressRunInit: bool(raw.wordpressRunInit),
      wordpressReleaseOwner: text(raw.wordpressReleaseOwner),
      fdThemeReleaseTag: text(raw.fdThemeReleaseTag),
      fdAdminUiReleaseTag: text(raw.fdAdminUiReleaseTag),
      fdMemberReleaseTag: text(raw.fdMemberReleaseTag),
      fdPaymentReleaseTag: text(raw.fdPaymentReleaseTag),
      fdCommerceReleaseTag: text(raw.fdCommerceReleaseTag),
      fdContentTypesReleaseTag: text(raw.fdContentTypesReleaseTag),
      fdWebsocketPushReleaseTag: text(raw.fdWebsocketPushReleaseTag),
      wpgraphqlJwtAuthReleaseTag: text(raw.wpgraphqlJwtAuthReleaseTag),
      wpgraphqlTaxQueryRef: text(raw.wpgraphqlTaxQueryRef)
    };
  }

  private buildRemoteInstallCommand(input: {
    token: string;
    exchangeUrl: string;
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
      "bash <(curl -fsSL https://raw.githubusercontent.com/FutureDecade/fd-headless-wp-system/main/scripts/remote-install.sh)"
    );

    return commandParts.join(' ');
  }

  private async buildBootstrapPayload(input: {
    app: DeploymentAppRecord;
    deployment: Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>;
    token?: string;
  }) {
    const appDefaults = this.readDeploymentDefaults(input.app);
    const deliverySettings = await new DeliverySettingsService(this.db, this.env).getStoredSettings(input.app.code);
    const defaults = {
      repoUrl: appDefaults.repoUrl || deliverySettings?.repoUrl,
      repoBranch: appDefaults.repoBranch || deliverySettings?.repoBranch,
      frontendImage: appDefaults.frontendImage || deliverySettings?.frontendImage,
      websocketImage: appDefaults.websocketImage || deliverySettings?.websocketImage,
      letsencryptEmail: appDefaults.letsencryptEmail || deliverySettings?.letsencryptEmail,
      wordpressFetchReleaseAssets:
        typeof appDefaults.wordpressFetchReleaseAssets === 'boolean'
          ? appDefaults.wordpressFetchReleaseAssets
          : deliverySettings?.wordpressFetchReleaseAssets,
      wordpressRunInit:
        typeof appDefaults.wordpressRunInit === 'boolean'
          ? appDefaults.wordpressRunInit
          : deliverySettings?.wordpressRunInit,
      wordpressReleaseOwner: appDefaults.wordpressReleaseOwner || deliverySettings?.wordpressReleaseOwner,
      fdThemeReleaseTag: appDefaults.fdThemeReleaseTag || deliverySettings?.fdThemeReleaseTag,
      fdAdminUiReleaseTag: appDefaults.fdAdminUiReleaseTag || deliverySettings?.fdAdminUiReleaseTag,
      fdMemberReleaseTag: appDefaults.fdMemberReleaseTag || deliverySettings?.fdMemberReleaseTag,
      fdPaymentReleaseTag: appDefaults.fdPaymentReleaseTag || deliverySettings?.fdPaymentReleaseTag,
      fdCommerceReleaseTag: appDefaults.fdCommerceReleaseTag || deliverySettings?.fdCommerceReleaseTag,
      fdContentTypesReleaseTag: appDefaults.fdContentTypesReleaseTag || deliverySettings?.fdContentTypesReleaseTag,
      fdWebsocketPushReleaseTag: appDefaults.fdWebsocketPushReleaseTag || deliverySettings?.fdWebsocketPushReleaseTag,
      wpgraphqlJwtAuthReleaseTag:
        appDefaults.wpgraphqlJwtAuthReleaseTag || deliverySettings?.wpgraphqlJwtAuthReleaseTag,
      wpgraphqlTaxQueryRef: appDefaults.wpgraphqlTaxQueryRef || deliverySettings?.wpgraphqlTaxQueryRef,
      acrUsername: deliverySettings?.acrUsername,
      acrPassword: deliverySettings?.acrPassword,
      githubToken: deliverySettings?.githubToken
    };
    const exchangeUrl = new URL('/v1/deployments/bootstrap/exchange', this.env.PUBLIC_BASE_URL).toString();
    const envDefaults = Object.fromEntries(
      Object.entries({
        FRONTEND_DOMAIN: input.deployment?.primaryDomain ?? undefined,
        ADMIN_DOMAIN: input.deployment?.adminDomain ?? undefined,
        WS_DOMAIN: input.deployment?.wsDomain ?? undefined,
        FRONTEND_IMAGE: defaults.frontendImage,
        WEBSOCKET_IMAGE: defaults.websocketImage,
        LETSENCRYPT_EMAIL: defaults.letsencryptEmail,
        WORDPRESS_FETCH_RELEASE_ASSETS:
          typeof defaults.wordpressFetchReleaseAssets === 'boolean' ? String(defaults.wordpressFetchReleaseAssets) : undefined,
        WORDPRESS_RUN_INIT:
          typeof defaults.wordpressRunInit === 'boolean' ? String(defaults.wordpressRunInit) : undefined,
        WORDPRESS_RELEASE_OWNER: defaults.wordpressReleaseOwner,
        FD_THEME_RELEASE_TAG: defaults.fdThemeReleaseTag,
        FD_ADMIN_UI_RELEASE_TAG: defaults.fdAdminUiReleaseTag,
        FD_MEMBER_RELEASE_TAG: defaults.fdMemberReleaseTag,
        FD_PAYMENT_RELEASE_TAG: defaults.fdPaymentReleaseTag,
        FD_COMMERCE_RELEASE_TAG: defaults.fdCommerceReleaseTag,
        FD_CONTENT_TYPES_RELEASE_TAG: defaults.fdContentTypesReleaseTag,
        FD_WEBSOCKET_PUSH_RELEASE_TAG: defaults.fdWebsocketPushReleaseTag,
        WPGRAPHQL_JWT_AUTH_RELEASE_TAG: defaults.wpgraphqlJwtAuthReleaseTag,
        WPGRAPHQL_TAX_QUERY_REF: defaults.wpgraphqlTaxQueryRef,
        ACR_USERNAME: defaults.acrUsername,
        ACR_PASSWORD: defaults.acrPassword,
        GH_TOKEN: defaults.githubToken,
        GITHUB_TOKEN: defaults.githubToken
      }).filter(([, value]) => typeof value === 'string' && value.length > 0)
    );

    return {
      installPath: input.deployment?.installPath ?? '/opt/fd-headless-wp-system',
      exchangeUrl,
      repository: {
        url: defaults.repoUrl ?? 'https://github.com/FutureDecade/fd-headless-wp-system.git',
        branch: defaults.repoBranch ?? 'main'
      },
      envDefaults,
      remoteInstallCommand: input.token
        ? this.buildRemoteInstallCommand({
            token: input.token,
            exchangeUrl,
            installPath: input.deployment?.installPath,
            repoUrl: defaults.repoUrl,
            repoBranch: defaults.repoBranch
          })
        : null,
      notes: [
        'Installer bootstrap now preloads deployment domains and any app-level deployment defaults into the existing install flow.',
        'If an env key is not present here, the installer will fall back to its current interactive prompt.'
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
    productCode?: string;
    label: string;
    environment: string;
    serverHost?: string;
    primaryDomain?: string;
    adminDomain?: string;
    wsDomain?: string;
    installPath?: string;
  }) {
    const selection = await this.resolveDeployableProduct({
      userId: input.userId,
      appCode: input.appCode,
      productCode: input.productCode
    });

    const deployment = await new DeploymentRepository(this.db).createDeployment({
      userId: input.userId,
      appId: selection.app.id,
      productId: selection.product.id,
      label: input.label,
      environment: input.environment,
      serverHost: input.serverHost ?? null,
      primaryDomain: input.primaryDomain ?? null,
      adminDomain: input.adminDomain ?? null,
      wsDomain: input.wsDomain ?? null,
      installPath: input.installPath ?? '/opt/fd-headless-wp-system',
      meta: {
        appCode: selection.app.code,
        productCode: selection.product.code
      }
    });

    await new EventService(this.db).capture({
      userId: input.userId,
      productId: selection.product.id,
      eventName: 'deployment.created',
      properties: {
        deploymentId: deployment.id,
        appCode: selection.app.code,
        productCode: selection.product.code,
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
      productId: deployment.productId,
      eventName: 'deployment.token_issued',
      properties: {
        deploymentId: deployment.id,
        tokenId: token.id,
        expiresAt: expiresAt.toISOString()
      }
    });

    const app = await new AppService(this.db).getPublicApp((await new AppRepository(this.db).findAppById(deployment.appId))?.code ?? '');
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
      productId: deployment.productId,
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
