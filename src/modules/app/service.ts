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
type PlanRecord = Awaited<ReturnType<LicenseRepository['listPlansByProductIds']>>[number];
type AppSecretRecord = Awaited<ReturnType<AppRepository['listAppSecretsByAppIds']>>[number];

export class AppService {
  constructor(private readonly db: DbClient) {}

  private isSecretUsable(secret: AppSecretRecord, now = new Date()) {
    return (
      secret.status === 'active' &&
      (!secret.expiresAt || secret.expiresAt.getTime() >= now.getTime())
    );
  }

  private createDefaultSecretName(appCode: string) {
    return `${appCode}-secret-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
  }

  private async hydrateApps(appRecords: AppRecord[], includeSecrets = false) {
    const repository = new AppRepository(this.db);
    const appIds = appRecords.map((app) => app.id);
    const productMappings = await repository.listProductMappingsByAppIds(appIds);
    const productIds = [...new Set(productMappings.map((item) => item.productId))];
    const licenseRepository = new LicenseRepository(this.db);
    const [products, plans] = await Promise.all([
      licenseRepository.listProductsByIds(productIds),
      licenseRepository.listPlansByProductIds(productIds)
    ]);
    const productMap = new Map(products.map((product) => [product.id, product]));
    const productsByAppId = new Map<string, ProductRecord[]>();
    const plansByProductId = new Map<string, PlanRecord[]>();

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

    for (const plan of plans) {
      if (!plansByProductId.has(plan.productId)) {
        plansByProductId.set(plan.productId, []);
      }

      plansByProductId.get(plan.productId)?.push(plan);
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
      plans: (productsByAppId.get(app.id) ?? []).flatMap((product) =>
        (plansByProductId.get(product.id) ?? []).map((plan) => ({
          id: plan.id,
          productId: plan.productId,
          productCode: product.code,
          productName: product.name,
          code: plan.code,
          name: plan.name,
          interval: plan.interval,
          priceAmount: plan.priceAmount,
          currency: plan.currency,
          status: plan.status
        }))
      ),
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
      planConfigs?: Array<{
        code: string;
        priceAmount: number;
        currency: string;
        status: 'active' | 'inactive' | 'cancelled' | 'expired';
      }>;
      meta?: Record<string, unknown>;
    },
    actorUserId: string
  ) {
    const productCodes = [...new Set(input.productCodes.map((code) => code.trim()).filter(Boolean))];
    const licenseRepository = new LicenseRepository(this.db);
    const products = await licenseRepository.listProductsByCodes(productCodes);

    if (products.length !== productCodes.length) {
      const found = new Set(products.map((product) => product.code));
      const missing = productCodes.filter((code) => !found.has(code));
      throw httpError(404, `Products not found: ${missing.join(', ')}`);
    }

    const planConfigs = [
      ...new Map(
        (input.planConfigs ?? []).map((item) => [
          item.code.trim(),
          {
            code: item.code.trim(),
            priceAmount: item.priceAmount,
            currency: item.currency.trim().toUpperCase() || 'CNY',
            status: item.status
          }
        ])
      ).values()
    ].filter((item) => item.code);
    const checkoutPlanCode =
      typeof input.meta?.checkoutPlanCode === 'string' ? input.meta.checkoutPlanCode.trim() : '';
    const planCodesToValidate = [
      ...new Set(
        [...planConfigs.map((item) => item.code), checkoutPlanCode].filter((code): code is string => Boolean(code))
      )
    ];
    const allowedProductIds = new Set(products.map((product) => product.id));
    const plans =
      planCodesToValidate.length > 0 ? await licenseRepository.listPlansByCodes(planCodesToValidate) : [];

    if (plans.length !== planCodesToValidate.length) {
      const found = new Set(plans.map((plan) => plan.code));
      const missing = planCodesToValidate.filter((code) => !found.has(code));
      throw httpError(404, `Plans not found: ${missing.join(', ')}`);
    }

    const disallowedPlans = plans.filter((plan) => !allowedProductIds.has(plan.productId));
    if (disallowedPlans.length > 0) {
      throw httpError(422, `Plans are not available to this app: ${disallowedPlans.map((plan) => plan.code).join(', ')}`);
    }

    const normalizedMeta = { ...(input.meta ?? {}) };
    if (checkoutPlanCode) {
      normalizedMeta.checkoutPlanCode = checkoutPlanCode;
    } else {
      delete normalizedMeta.checkoutPlanCode;
    }

    await this.db.transaction(async (tx) => {
      const repository = new AppRepository(tx as DbClient);
      const app = await repository.upsertApp({
        code: appCode,
        name: input.name,
        description: input.description,
        type: input.type,
        status: input.status,
        meta: normalizedMeta
      });

      await repository.replaceAppProducts(
        app.id,
        products.map((product) => product.id)
      );

      const txLicenseRepository = new LicenseRepository(tx as DbClient);
      const planMap = new Map(plans.map((plan) => [plan.code, plan]));
      for (const planConfig of planConfigs) {
        const plan = planMap.get(planConfig.code);
        if (!plan) {
          continue;
        }

        await txLicenseRepository.updatePlanById(plan.id, {
          priceAmount: planConfig.priceAmount,
          currency: planConfig.currency,
          status: planConfig.status
        });
      }

      await new EventService(tx as DbClient).capture({
        userId: actorUserId,
        eventName: 'app.upserted',
        properties: {
          appCode,
          productCodes,
          checkoutPlanCode: checkoutPlanCode || null,
          updatedPlanCodes: planConfigs.map((plan) => plan.code),
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
      name?: string;
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
      name: input.name?.trim() || this.createDefaultSecretName(app.code),
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

  async revokeSecret(appCode: string, secretId: string, actorUserId: string) {
    const app = await new AppRepository(this.db).findAppByCode(appCode);
    if (!app) {
      throw httpError(404, 'App not found');
    }

    const repository = new AppRepository(this.db);
    const secret = await repository.findAppSecretById(secretId);

    if (!secret || secret.appId !== app.id) {
      throw httpError(404, 'App secret not found');
    }

    const updated = secret.status === 'cancelled' ? secret : await repository.updateAppSecretStatus(secret.id, 'cancelled');

    if (!updated) {
      throw httpError(500, 'Failed to revoke app secret');
    }

    await new EventService(this.db).capture({
      userId: actorUserId,
      eventName: 'app.secret_revoked',
      properties: {
        appCode: app.code,
        secretId: updated.id,
        hint: updated.hint,
        previousStatus: secret.status
      }
    });

    return {
      appCode: app.code,
      appName: app.name,
      secretId: updated.id,
      hint: updated.hint,
      status: updated.status,
      expiresAt: updated.expiresAt,
      lastUsedAt: updated.lastUsedAt
    };
  }
}
