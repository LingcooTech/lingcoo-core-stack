import { randomBytes } from 'node:crypto';

import type { DbClient } from '../../db/types';
import { httpError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/security';
import { EventService } from '../event/service';
import { LicenseRepository } from '../license/repository';
import { LicenseService } from '../license/service';
import { AppRepository } from './repository';

type AppRecord = NonNullable<Awaited<ReturnType<AppRepository['findAppByCode']>>>;
type ProductRecord = Awaited<ReturnType<LicenseRepository['listProductsByIds']>>[number];
type AppSecretRecord = Awaited<ReturnType<AppRepository['listAppSecretsByAppIds']>>[number];

export class AppService {
  constructor(private readonly db: DbClient) {}

  private isSecretUsable(secret: AppSecretRecord, now = new Date()) {
    return (
      secret.status === 'active' &&
      (!secret.expiresAt || secret.expiresAt.getTime() >= now.getTime())
    );
  }

  private async hydrateApps(appRecords: AppRecord[], includeSecrets = false) {
    const repository = new AppRepository(this.db);
    const appIds = appRecords.map((app) => app.id);
    const productMappings = await repository.listProductMappingsByAppIds(appIds);
    const productIds = [...new Set(productMappings.map((item) => item.productId))];
    const products = await new LicenseRepository(this.db).listProductsByIds(productIds);
    const productMap = new Map(products.map((product) => [product.id, product]));
    const productsByAppId = new Map<string, ProductRecord[]>();

    for (const mapping of productMappings) {
      const product = productMap.get(mapping.productId);
      if (!product) {
        continue;
      }

      if (!productsByAppId.has(mapping.appId)) {
        productsByAppId.set(mapping.appId, []);
      }

      productsByAppId.get(mapping.appId)?.push(product);
    }

    const secretsByAppId = new Map<string, AppSecretRecord[]>();
    if (includeSecrets) {
      const secrets = await repository.listAppSecretsByAppIds(appIds);
      for (const secret of secrets) {
        if (!secretsByAppId.has(secret.appId)) {
          secretsByAppId.set(secret.appId, []);
        }
        secretsByAppId.get(secret.appId)?.push(secret);
      }
    }

    return appRecords.map((app) => ({
      id: app.id,
      code: app.code,
      name: app.name,
      description: app.description,
      type: app.type,
      status: app.status,
      meta: app.meta,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      products: (productsByAppId.get(app.id) ?? []).map((product) => ({
        id: product.id,
        code: product.code,
        name: product.name,
        type: product.type,
        status: product.status
      })),
      secrets: includeSecrets
        ? (secretsByAppId.get(app.id) ?? []).map((secret) => ({
            id: secret.id,
            name: secret.name,
            hint: secret.hint,
            status: secret.status,
            lastUsedAt: secret.lastUsedAt,
            expiresAt: secret.expiresAt,
            createdAt: secret.createdAt
          }))
        : undefined
    }));
  }

  async listActiveApps() {
    const apps = await new AppRepository(this.db).listApps();
    return this.hydrateApps(apps.filter((app) => app.status === 'active'));
  }

  async listManagedApps() {
    const apps = await new AppRepository(this.db).listApps();
    return this.hydrateApps(apps, true);
  }

  async getPublicApp(appCode: string) {
    const app = await new AppRepository(this.db).findAppByCode(appCode);
    if (!app || app.status !== 'active') {
      throw httpError(404, 'App not found or inactive');
    }

    const [hydrated] = await this.hydrateApps([app]);
    return hydrated;
  }

  async getManagedApp(appCode: string) {
    const app = await new AppRepository(this.db).findAppByCode(appCode);
    if (!app) {
      throw httpError(404, 'App not found');
    }

    const [hydrated] = await this.hydrateApps([app], true);
    return hydrated;
  }

  async requireActiveApp(appCode: string) {
    const app = await new AppRepository(this.db).findAppByCode(appCode);
    if (!app || app.status !== 'active') {
      throw httpError(404, 'App not found or inactive');
    }

    return app;
  }

  async authenticateAppSecret(appCode: string, plainSecret: string) {
    const app = await this.requireActiveApp(appCode);
    const secrets = await new AppRepository(this.db).listAppSecretsByAppIds([app.id]);
    const matched = secrets.find(
      (secret) => this.isSecretUsable(secret) && verifyPassword(plainSecret, secret.secretHash)
    );

    if (!matched) {
      throw httpError(401, 'Invalid app secret');
    }

    const touched = await new AppRepository(this.db).markAppSecretUsed(matched.id);
    const secret = touched ?? matched;

    await new EventService(this.db).capture({
      eventName: 'app.session_authenticated',
      properties: {
        appCode: app.code,
        secretId: secret.id,
        hint: secret.hint
      }
    });

    return {
      app,
      secret
    };
  }

  async requireActiveSecretById(appCode: string, secretId: string) {
    const app = await this.requireActiveApp(appCode);
    const secret = await new AppRepository(this.db).findAppSecretById(secretId);

    if (!secret || secret.appId !== app.id || !this.isSecretUsable(secret)) {
      throw httpError(401, 'Invalid or expired app token');
    }

    return {
      app,
      secret
    };
  }

  async assertAppAllowsProduct(appId: string, productId: string) {
    const mappings = await new AppRepository(this.db).listProductMappingsByAppIds([appId]);
    const allowed = mappings.some((mapping) => mapping.productId === productId);

    if (!allowed) {
      throw httpError(403, 'The requested plan is not allowed for this app');
    }
  }

  async getAppCatalog(appCode: string) {
    const app = await this.getPublicApp(appCode);
    const allowedProductCodes = new Set(app.products.map((product) => product.code));
    const snapshot = await new LicenseService(this.db).getCatalogSnapshot();
    const products = snapshot.products.filter((product) => allowedProductCodes.has(product.code));
    const productIds = new Set(products.map((product) => product.id));
    const plans = snapshot.plans.filter((plan) => productIds.has(plan.productId));
    const features = snapshot.features.filter((feature) => productIds.has(feature.productId));
    const planIds = new Set(plans.map((plan) => plan.id));
    const featureIds = new Set(features.map((feature) => feature.id));

    return {
      app,
      products,
      plans,
      features,
      planFeatures: snapshot.planFeatures.filter(
        (mapping) => planIds.has(mapping.planId) && featureIds.has(mapping.featureId)
      )
    };
  }

  async listUserEntitlementsForApp(appCode: string, userId: string) {
    const app = await this.getPublicApp(appCode);
    const allowedProductCodes = new Set(app.products.map((product) => product.code));
    const entitlements = await new LicenseService(this.db).listUserEntitlements(userId);

    return {
      app,
      items: entitlements.items.filter((item) => item.product && allowedProductCodes.has(item.product.code)),
      summary: entitlements.summary.filter((item) => allowedProductCodes.has(item.productCode))
    };
  }

  async upsertApp(
    appCode: string,
    input: {
      name: string;
      description?: string;
      type: 'chrome_extension' | 'web_app' | 'service';
      status: 'active' | 'inactive' | 'cancelled' | 'expired';
      productCodes: string[];
      meta?: Record<string, unknown>;
    },
    actorUserId: string
  ) {
    const productCodes = [...new Set(input.productCodes.map((code) => code.trim()).filter(Boolean))];
    const products = await new LicenseRepository(this.db).listProductsByCodes(productCodes);

    if (products.length !== productCodes.length) {
      const found = new Set(products.map((product) => product.code));
      const missing = productCodes.filter((code) => !found.has(code));
      throw httpError(404, `Products not found: ${missing.join(', ')}`);
    }

    await this.db.transaction(async (tx) => {
      const repository = new AppRepository(tx as DbClient);
      const app = await repository.upsertApp({
        code: appCode,
        name: input.name,
        description: input.description,
        type: input.type,
        status: input.status,
        meta: input.meta
      });

      await repository.replaceAppProducts(
        app.id,
        products.map((product) => product.id)
      );

      await new EventService(tx as DbClient).capture({
        userId: actorUserId,
        eventName: 'app.upserted',
        properties: {
          appCode,
          productCodes,
          status: input.status,
          type: input.type
        }
      });
    });

    return this.getManagedApp(appCode);
  }

  async issueSecret(
    appCode: string,
    input: {
      name: string;
      expiresAt?: string;
    },
    actorUserId: string
  ) {
    const app = await new AppRepository(this.db).findAppByCode(appCode);
    if (!app) {
      throw httpError(404, 'App not found');
    }

    const plainSecret = `fds_${randomBytes(24).toString('base64url')}`;
    const secret = await new AppRepository(this.db).createAppSecret({
      appId: app.id,
      name: input.name,
      secretHash: hashPassword(plainSecret),
      hint: plainSecret.slice(-6),
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
    });

    await new EventService(this.db).capture({
      userId: actorUserId,
      eventName: 'app.secret_issued',
      properties: {
        appCode: app.code,
        secretId: secret.id,
        hint: secret.hint
      }
    });

    return {
      appCode: app.code,
      appName: app.name,
      secretId: secret.id,
      secret: plainSecret,
      hint: secret.hint,
      expiresAt: secret.expiresAt,
      createdAt: secret.createdAt
    };
  }
}
