import { randomBytes } from 'node:crypto';

import type { DbClient } from '../../db/types';
import { parseDeliveryManifest } from '../../lib/delivery-settings';
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
type CheckoutOfferStatus = 'active' | 'inactive' | 'cancelled' | 'expired';
type CheckoutOfferInput = {
  code: string;
  planCode: string;
  title?: string;
  description?: string;
  badge?: string;
  priceAmount: number;
  currency: string;
  status: CheckoutOfferStatus;
  isDefault?: boolean;
  sortOrder?: number;
};
type CheckoutOffer = {
  code: string;
  planCode: string;
  planId: string;
  productId: string;
  productCode: string;
  productName: string;
  title: string;
  description: string | null;
  badge: string | null;
  interval: 'month' | 'year' | 'one_time';
  priceAmount: number;
  currency: string;
  status: CheckoutOfferStatus;
  isDefault: boolean;
  sortOrder: number;
};

export class AppService {
  constructor(private readonly db: DbClient) {}

  private normalizeMeta(meta: unknown) {
    return meta && typeof meta === 'object' && !Array.isArray(meta) ? { ...(meta as Record<string, unknown>) } : {};
  }

  private normalizeDeliveryManifestSource(value: unknown) {
    const raw = this.normalizeMeta(value);
    return {
      repoUrl: typeof raw.repoUrl === 'string' ? raw.repoUrl.trim() : '',
      repoBranch: typeof raw.repoBranch === 'string' ? raw.repoBranch.trim() : '',
      manifestPath: typeof raw.manifestPath === 'string' ? raw.manifestPath.trim() : '',
      manifestUrl: typeof raw.manifestUrl === 'string' ? raw.manifestUrl.trim() : ''
    };
  }

  private resolveDeliveryManifestUrl(input: {
    repoUrl?: string;
    repoBranch?: string;
    manifestPath?: string;
    manifestUrl?: string;
  }) {
    if (input.manifestUrl?.trim()) {
      return input.manifestUrl.trim();
    }

    const repoUrl = input.repoUrl?.trim() ?? '';
    const repoBranch = input.repoBranch?.trim() || 'main';
    const manifestPath = input.manifestPath?.trim() || 'fd-delivery.manifest.json';

    if (!repoUrl) {
      throw httpError(422, 'Delivery manifest source repoUrl is not configured');
    }

    const httpsMatch = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
    const sshMatch = repoUrl.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
    const match = httpsMatch ?? sshMatch;

    if (!match) {
      throw httpError(422, 'Only GitHub repository URLs are supported for manifest sync');
    }

    const [, owner, repo] = match;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${repoBranch}/${manifestPath}`;
  }

  private readCheckoutDefaultOfferCode(meta: unknown) {
    const normalized = this.normalizeMeta(meta);
    const offerCode =
      typeof normalized.checkoutDefaultOfferCode === 'string'
        ? normalized.checkoutDefaultOfferCode.trim()
        : typeof normalized.checkoutPlanCode === 'string'
          ? normalized.checkoutPlanCode.trim()
          : '';

    return offerCode;
  }

  private readCheckoutOffers(meta: unknown) {
    const normalized = this.normalizeMeta(meta);
    return Array.isArray(normalized.checkoutOffers) ? normalized.checkoutOffers : [];
  }

  private buildCheckoutOffers(input: {
    app: {
      meta: unknown;
    };
    products: Array<{
      id: string;
      code: string;
      name: string;
    }>;
    plans: Array<{
      id: string;
      productId: string;
      code: string;
      name: string;
      interval: 'month' | 'year' | 'one_time';
      priceAmount: number;
      currency: string;
      status: CheckoutOfferStatus;
    }>;
  }) {
    const productMap = new Map(input.products.map((product) => [product.id, product]));
    const planMap = new Map(input.plans.map((plan) => [plan.code, plan]));
    const configuredDefaultOfferCode = this.readCheckoutDefaultOfferCode(input.app.meta);
    const rawOffers = this.readCheckoutOffers(input.app.meta);

    const configuredOffers = rawOffers
      .map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }

        const raw = item as Record<string, unknown>;
        const offerCode = typeof raw.code === 'string' ? raw.code.trim() : '';
        const planCode = typeof raw.planCode === 'string' ? raw.planCode.trim() : '';
        const plan = planMap.get(planCode);
        if (!offerCode || !plan) {
          return null;
        }

        const product = productMap.get(plan.productId);
        if (!product) {
          return null;
        }

        return {
          code: offerCode,
          planCode: plan.code,
          planId: plan.id,
          productId: plan.productId,
          productCode: product.code,
          productName: product.name,
          title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : plan.name,
          description: typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : null,
          badge: typeof raw.badge === 'string' && raw.badge.trim() ? raw.badge.trim() : null,
          interval: plan.interval,
          priceAmount:
            typeof raw.priceAmount === 'number' && Number.isInteger(raw.priceAmount) && raw.priceAmount >= 0
              ? raw.priceAmount
              : plan.priceAmount,
          currency:
            typeof raw.currency === 'string' && raw.currency.trim()
              ? raw.currency.trim().toUpperCase()
              : plan.currency,
          status:
            raw.status === 'active' || raw.status === 'inactive' || raw.status === 'cancelled' || raw.status === 'expired'
              ? raw.status
              : plan.status,
          isDefault:
            raw.isDefault === true || (configuredDefaultOfferCode ? configuredDefaultOfferCode === offerCode : index === 0),
          sortOrder:
            typeof raw.sortOrder === 'number' && Number.isFinite(raw.sortOrder) ? raw.sortOrder : index
        } satisfies CheckoutOffer;
      })
      .filter((item): item is CheckoutOffer => item !== null);

    if (configuredOffers.length > 0) {
      const ordered = configuredOffers
        .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code))
        .map((offer, index) => ({
          ...offer,
          isDefault:
            configuredDefaultOfferCode
              ? offer.code === configuredDefaultOfferCode
              : configuredOffers.every((item) => item.isDefault === false)
                ? index === 0
                : offer.isDefault
        }));

      if (!ordered.some((offer) => offer.isDefault) && ordered[0]) {
        ordered[0] = { ...ordered[0], isDefault: true };
      }

      return ordered;
    }

    const fallbackPlans = input.plans
      .filter((plan) => plan.status === 'active')
      .sort((left, right) => {
        const weight = { month: 0, year: 1, one_time: 2 };
        return weight[left.interval] - weight[right.interval] || left.code.localeCompare(right.code);
      });

    return fallbackPlans.map((plan, index) => {
      const product = productMap.get(plan.productId);
      return {
        code: plan.code,
        planCode: plan.code,
        planId: plan.id,
        productId: plan.productId,
        productCode: product?.code ?? '',
        productName: product?.name ?? '',
        title: plan.name,
        description: null,
        badge: null,
        interval: plan.interval,
        priceAmount: plan.priceAmount,
        currency: plan.currency,
        status: plan.status,
        isDefault: configuredDefaultOfferCode ? configuredDefaultOfferCode === plan.code : index === 0,
        sortOrder: index
      } satisfies CheckoutOffer;
    });
  }

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

    return appRecords.map((app) => {
      const appProducts = productsByAppId.get(app.id) ?? [];
      const appPlans = appProducts.flatMap((product) =>
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
      );

      return {
        id: app.id,
        code: app.code,
        name: app.name,
        tagline: app.tagline,
        description: app.description,
        content: app.content,
        iconUrl: app.iconUrl,
        coverUrl: app.coverUrl,
        screenshots: app.screenshots,
        highlights: app.highlights,
        faq: app.faq,
        links: app.links,
        category: app.category,
        sortOrder: app.sortOrder,
        type: app.type,
        status: app.status,
        meta: app.meta,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
        products: appProducts.map((product) => ({
          id: product.id,
          code: product.code,
          name: product.name,
          type: product.type,
          status: product.status
        })),
        plans: appPlans,
        checkoutOffers: this.buildCheckoutOffers({
          app,
          products: appProducts.map((product) => ({
            id: product.id,
            code: product.code,
            name: product.name
          })),
          plans: appPlans.map((plan) => ({
            id: plan.id,
            productId: plan.productId,
            code: plan.code,
            name: plan.name,
            interval: plan.interval,
            priceAmount: plan.priceAmount,
            currency: plan.currency,
            status: plan.status
          }))
        }),
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
      };
    });
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
    const offers = this.buildCheckoutOffers({
      app,
      products: products.map((product) => ({
        id: product.id,
        code: product.code,
        name: product.name
      })),
      plans: plans.map((plan) => ({
        id: plan.id,
        productId: plan.productId,
        code: plan.code,
        name: plan.name,
        interval: plan.interval,
        priceAmount: plan.priceAmount,
        currency: plan.currency,
        status: plan.status
      }))
    });

    return {
      app,
      products,
      plans,
      offers,
      features,
      planFeatures: snapshot.planFeatures.filter(
        (mapping) => planIds.has(mapping.planId) && featureIds.has(mapping.featureId)
      )
    };
  }

  async resolveCheckoutOffer(
    appCode: string,
    input: {
      planCode?: string;
      offerCode?: string;
    }
  ) {
    const catalog = await this.getAppCatalog(appCode);
    const activeOffers = catalog.offers.filter((offer) => offer.status === 'active');

    if (activeOffers.length === 0) {
      throw httpError(422, 'No active checkout offers are configured for this app');
    }

    let offer =
      (input.offerCode ? activeOffers.find((item) => item.code === input.offerCode) : null) ??
      null;

    if (input.offerCode && !offer) {
      throw httpError(404, `Checkout offer not found: ${input.offerCode}`);
    }

    if (!offer && input.planCode) {
      const matchedOffers = activeOffers.filter((item) => item.planCode === input.planCode);
      if (matchedOffers.length === 1) {
        [offer] = matchedOffers;
      } else if (matchedOffers.length > 1) {
        offer = matchedOffers.find((item) => item.isDefault) ?? matchedOffers[0] ?? null;
      } else {
        throw httpError(404, `Checkout plan is not available for this app: ${input.planCode}`);
      }
    }

    if (!offer) {
      offer = activeOffers.find((item) => item.isDefault) ?? activeOffers[0] ?? null;
    }

    if (!offer) {
      throw httpError(404, 'Checkout offer not found');
    }

    const product = catalog.products.find((item) => item.id === offer.productId);
    const plan = catalog.plans.find((item) => item.id === offer.planId);

    if (!product || !plan) {
      throw httpError(500, 'Checkout offer is missing related product or plan');
    }

    return {
      app: catalog.app,
      product,
      plan,
      offer
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
      tagline?: string;
      description?: string;
      content?: string;
      iconUrl?: string;
      coverUrl?: string;
      screenshots?: Array<{ url: string; caption?: string }>;
      highlights?: Array<{ icon?: string; title: string; description: string }>;
      faq?: Array<{ question: string; answer: string }>;
      links?: Array<{ label: string; url: string; type: string }>;
      category?: string;
      sortOrder?: number;
      type: 'chrome_extension' | 'web_app' | 'service';
      status: 'active' | 'inactive' | 'cancelled' | 'expired';
      productCodes: string[];
      checkoutOffers?: CheckoutOfferInput[];
      checkoutDefaultOfferCode?: string;
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

    const checkoutOffers = (input.checkoutOffers ?? []).map((item, index) => ({
      code: item.code.trim(),
      planCode: item.planCode.trim(),
      title: (item.title ?? '').trim(),
      description: item.description?.trim() || '',
      badge: item.badge?.trim() || '',
      priceAmount: item.priceAmount,
      currency: item.currency.trim().toUpperCase() || 'CNY',
      status: item.status,
      isDefault: item.isDefault === true,
      sortOrder: item.sortOrder ?? index
    })).filter((item) => item.code && item.planCode && item.title);
    const checkoutDefaultOfferCode = input.checkoutDefaultOfferCode?.trim() || '';
    const offerPlanCodes = [...new Set(checkoutOffers.map((item) => item.planCode))];
    const offerPlans =
      offerPlanCodes.length > 0 ? await licenseRepository.listPlansByCodes(offerPlanCodes) : [];

    if (offerPlans.length !== offerPlanCodes.length) {
      const found = new Set(offerPlans.map((plan) => plan.code));
      const missing = offerPlanCodes.filter((code) => !found.has(code));
      throw httpError(404, `Offer plans not found: ${missing.join(', ')}`);
    }

    const disallowedOfferPlans = offerPlans.filter((plan) => !allowedProductIds.has(plan.productId));
    if (disallowedOfferPlans.length > 0) {
      throw httpError(
        422,
        `Offer plans are not available to this app: ${disallowedOfferPlans.map((plan) => plan.code).join(', ')}`
      );
    }

    if (checkoutDefaultOfferCode && !checkoutOffers.some((offer) => offer.code === checkoutDefaultOfferCode)) {
      throw httpError(422, `Default checkout offer not found: ${checkoutDefaultOfferCode}`);
    }

    const normalizedMeta = { ...(input.meta ?? {}) };
    if (checkoutOffers.length > 0) {
      normalizedMeta.checkoutOffers = checkoutOffers;
      normalizedMeta.checkoutDefaultOfferCode =
        checkoutDefaultOfferCode ||
        checkoutOffers.find((offer) => offer.isDefault)?.code ||
        checkoutOffers[0]?.code ||
        null;
    } else {
      delete normalizedMeta.checkoutOffers;
      delete normalizedMeta.checkoutDefaultOfferCode;
    }

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
        tagline: input.tagline,
        description: input.description,
        content: input.content,
        iconUrl: input.iconUrl,
        coverUrl: input.coverUrl,
        screenshots: input.screenshots,
        highlights: input.highlights,
        faq: input.faq,
        links: input.links,
        category: input.category,
        sortOrder: input.sortOrder,
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
          checkoutOfferCodes: checkoutOffers.map((offer) => offer.code),
          checkoutDefaultOfferCode: normalizedMeta.checkoutDefaultOfferCode ?? null,
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

  async syncDeliveryManifest(
    appCode: string,
    input: {
      repoUrl?: string;
      repoBranch?: string;
      manifestPath?: string;
      manifestUrl?: string;
    },
    actorUserId: string
  ) {
    const app = await new AppRepository(this.db).findAppByCode(appCode);
    if (!app) {
      throw httpError(404, 'App not found');
    }

    const meta = this.normalizeMeta(app.meta);
    const currentSource = this.normalizeDeliveryManifestSource(meta.deliveryManifestSource);
    const currentManifest = this.normalizeMeta(meta.deliveryManifest);
    const currentInstaller = this.normalizeMeta(currentManifest.installer);

    const nextSource = {
      repoUrl: input.repoUrl?.trim() || currentSource.repoUrl || (typeof currentInstaller.repoUrl === 'string' ? currentInstaller.repoUrl.trim() : ''),
      repoBranch:
        input.repoBranch?.trim() ||
        currentSource.repoBranch ||
        (typeof currentInstaller.repoBranch === 'string' ? currentInstaller.repoBranch.trim() : 'main'),
      manifestPath: input.manifestPath?.trim() || currentSource.manifestPath || 'fd-delivery.manifest.json',
      manifestUrl: input.manifestUrl?.trim() || currentSource.manifestUrl || ''
    };

    const manifestUrl = this.resolveDeliveryManifestUrl(nextSource);
    const response = await fetch(manifestUrl, {
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      throw httpError(502, `Failed to fetch delivery manifest: ${response.status}`);
    }

    const remoteManifest = parseDeliveryManifest((await response.json()) as unknown);
    const nextMeta = {
      ...meta,
      deliveryManifest: remoteManifest,
      deliveryManifestSource: nextSource
    };

    await new AppRepository(this.db).updateAppMetaByCode(appCode, nextMeta);

    await new EventService(this.db).capture({
      userId: actorUserId,
      eventName: 'app.delivery_manifest_synced',
      properties: {
        appCode,
        manifestUrl,
        repoUrl: nextSource.repoUrl,
        repoBranch: nextSource.repoBranch,
        manifestPath: nextSource.manifestPath || null
      }
    });

    return this.getManagedApp(appCode);
  }
}
