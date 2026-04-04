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
type AppSecretRecord = Awaited<ReturnType<AppRepository['listAppSecretsByAppIds']>>[number];

type HydratedOffer = {
  id: string;
  code: string;
  priceId: string;
  priceCode: string;
  productId: string;
  productCode: string;
  productName: string;
  authorizationTemplateId: string;
  authorizationTemplateCode: string;
  authorizationTemplateName: string;
  title: string;
  description: string | null;
  badge: string | null;
  billingType: 'one_time' | 'recurring';
  billingInterval: 'month' | 'year' | null;
  interval: 'month' | 'year' | 'one_time';
  amount: number;
  priceAmount: number;
  currency: string;
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
  isDefault: boolean;
  sortOrder: number;
};

type HydratedApp = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: 'chrome_extension' | 'web_app' | 'service';
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  tagline: string | null;
  content: string | null;
  iconUrl: string | null;
  coverUrl: string | null;
  screenshots: unknown[];
  highlights: unknown[];
  faq: unknown[];
  links: unknown[];
  category: string | null;
  sortOrder: number;
  storefront: {
    tagline: string | null;
    description: string | null;
    iconUrl: string | null;
    coverUrl: string | null;
    category: string | null;
  } | null;
  products: Array<{
    id: string;
    code: string;
    name: string;
    tagline: string | null;
    description: string | null;
    content: string | null;
    iconUrl: string | null;
    coverUrl: string | null;
    screenshots: unknown[];
    highlights: unknown[];
    faq: unknown[];
    links: unknown[];
    category: string | null;
    deliveryMode: 'direct_access' | 'one_click_deploy';
    sortOrder: number;
    status: 'active' | 'inactive' | 'cancelled' | 'expired';
    meta: Record<string, unknown>;
  }>;
  prices: Array<{
    id: string;
    productId: string;
    productCode: string;
    productName: string;
    authorizationTemplateId: string;
    authorizationTemplateCode: string;
    authorizationTemplateName: string;
    code: string;
    name: string;
    billingType: 'one_time' | 'recurring';
    billingInterval: 'month' | 'year' | null;
    amount: number;
    currency: string;
    grantStrategy: 'lifetime' | 'fixed_duration' | 'subscription_period';
    grantDurationDays: number | null;
    status: 'active' | 'inactive' | 'cancelled' | 'expired';
  }>;
  authorizationTemplates: Array<{
    id: string;
    productId: string;
    productCode: string;
    productName: string;
    code: string;
    name: string;
    description: string | null;
    status: 'active' | 'inactive' | 'cancelled' | 'expired';
  }>;
  checkoutOffers: HydratedOffer[];
  secrets?: Array<{
    id: string;
    name: string;
    hint: string;
    status: 'active' | 'inactive' | 'cancelled' | 'expired';
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
  }>;
};

type CheckoutOfferInput = {
  code: string;
  priceCode: string;
  title: string;
  description?: string;
  badge?: string;
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
  isDefault?: boolean;
  sortOrder?: number;
};

export class AppService {
  constructor(private readonly db: DbClient) {}

  private normalizeMeta(meta: unknown) {
    return meta && typeof meta === 'object' && !Array.isArray(meta) ? { ...(meta as Record<string, unknown>) } : {};
  }

  private readStorefront(products: HydratedApp['products']) {
    const primaryProduct = [...products].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))[0];
    if (!primaryProduct) {
      return null;
    }

    return {
      tagline: primaryProduct.tagline,
      description: primaryProduct.description,
      iconUrl: primaryProduct.iconUrl,
      coverUrl: primaryProduct.coverUrl,
      category: primaryProduct.category
    };
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

  private resolveRepoDeliveryManifestUrl(input: {
    repoUrl?: string;
    repoBranch?: string;
    manifestPath?: string;
  }) {
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

  private async fetchDeliveryManifestWithFallback(input: {
    repoUrl?: string;
    repoBranch?: string;
    manifestPath?: string;
    manifestUrl?: string;
  }) {
    const attempts: string[] = [];
    const candidates: Array<{ label: 'repoUrl' | 'manifestUrl'; url: string }> = [];

    if (input.repoUrl?.trim()) {
      try {
        candidates.push({
          label: 'repoUrl',
          url: this.resolveRepoDeliveryManifestUrl(input)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'failed to resolve repository manifest URL';
        attempts.push(`repoUrl: ${message}`);
      }
    }

    if (input.manifestUrl?.trim()) {
      candidates.push({
        label: 'manifestUrl',
        url: input.manifestUrl.trim()
      });
    }

    const uniqueCandidates = candidates.filter(
      (candidate, index, list) => list.findIndex((item) => item.url === candidate.url) === index
    );

    if (uniqueCandidates.length === 0) {
      throw httpError(422, 'Neither repository manifest source nor backup manifest URL is configured');
    }

    for (const candidate of uniqueCandidates) {
      try {
        const response = await fetch(candidate.url, {
          signal: AbortSignal.timeout(30_000)
        });

        if (!response.ok) {
          attempts.push(`${candidate.label}: HTTP ${response.status}`);
          continue;
        }

        return {
          manifestUrl: candidate.url,
          manifest: parseDeliveryManifest((await response.json()) as unknown),
          source: candidate.label
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'fetch failed';
        attempts.push(`${candidate.label}: ${message}`);
      }
    }

    throw httpError(502, `Failed to fetch delivery manifest. ${attempts.join(' | ')}`);
  }

  private buildFallbackOffers(input: {
    prices: HydratedApp['prices'];
  }): HydratedOffer[] {
    return [...input.prices]
      .filter((price) => price.status === 'active')
      .sort((left, right) => left.amount - right.amount || left.code.localeCompare(right.code))
      .map((price, index) => ({
        id: `fallback:${price.id}`,
        code: `${price.code}_offer`,
        priceId: price.id,
        priceCode: price.code,
        productId: price.productId,
        productCode: price.productCode,
        productName: price.productName,
        authorizationTemplateId: price.authorizationTemplateId,
        authorizationTemplateCode: price.authorizationTemplateCode,
        authorizationTemplateName: price.authorizationTemplateName,
        title: price.name,
        description: null,
        badge: null,
        billingType: price.billingType,
        billingInterval: price.billingInterval,
        interval: price.billingType === 'one_time' ? 'one_time' : (price.billingInterval ?? 'one_time'),
        amount: price.amount,
        priceAmount: price.amount,
        currency: price.currency,
        status: price.status,
        isDefault: index === 0,
        sortOrder: index
      }));
  }

  private isSecretUsable(secret: AppSecretRecord, now = new Date()) {
    return secret.status === 'active' && (!secret.expiresAt || secret.expiresAt.getTime() >= now.getTime());
  }

  private createDefaultSecretName(appCode: string) {
    return `${appCode}-secret-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
  }

  private async hydrateApps(appRecords: AppRecord[], includeSecrets = false): Promise<HydratedApp[]> {
    const repository = new AppRepository(this.db);
    const appIds = appRecords.map((app) => app.id);
    const productMappings = await repository.listProductMappingsByAppIds(appIds);
    const productIds = [...new Set(productMappings.map((item) => item.productId))];
    const licenseRepository = new LicenseRepository(this.db);
    const [products, prices, authorizationTemplates, offers] = await Promise.all([
      licenseRepository.listProductsByIds(productIds),
      licenseRepository.listPricesByProductIds(productIds),
      productIds.length > 0
        ? Promise.all(productIds.map((productId) => licenseRepository.listAuthorizationTemplatesByProductId(productId))).then((items) =>
            items.flat()
          )
        : Promise.resolve([]),
      licenseRepository.listCheckoutOffersByAppIds(appIds)
    ]);

    const productMap = new Map(products.map((product) => [product.id, product]));
    const priceMap = new Map(prices.map((price) => [price.id, price]));
    const templateMap = new Map(authorizationTemplates.map((template) => [template.id, template]));
    const productsByAppId = new Map<string, typeof products>();
    const pricesByProductId = new Map<string, typeof prices>();
    const templatesByProductId = new Map<string, typeof authorizationTemplates>();
    const offersByAppId = new Map<string, typeof offers>();

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

    for (const price of prices) {
      if (!pricesByProductId.has(price.productId)) {
        pricesByProductId.set(price.productId, []);
      }
      pricesByProductId.get(price.productId)?.push(price);
    }

    for (const template of authorizationTemplates) {
      if (!templatesByProductId.has(template.productId)) {
        templatesByProductId.set(template.productId, []);
      }
      templatesByProductId.get(template.productId)?.push(template);
    }

    for (const offer of offers) {
      if (!offersByAppId.has(offer.appId)) {
        offersByAppId.set(offer.appId, []);
      }
      offersByAppId.get(offer.appId)?.push(offer);
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
      const appProducts = (productsByAppId.get(app.id) ?? []).map((product) => ({
        id: product.id,
        code: product.code,
        name: product.name,
        tagline: product.tagline,
        description: product.description,
        content: product.content,
        iconUrl: product.iconUrl,
        coverUrl: product.coverUrl,
        screenshots: Array.isArray(product.screenshots) ? product.screenshots : [],
        highlights: Array.isArray(product.highlights) ? product.highlights : [],
        faq: Array.isArray(product.faq) ? product.faq : [],
        links: Array.isArray(product.links) ? product.links : [],
        category: product.category,
        deliveryMode: product.deliveryMode,
        sortOrder: product.sortOrder,
        status: product.status,
        meta: this.normalizeMeta(product.meta)
      }));

      const appPrices = appProducts.flatMap((product) =>
        (pricesByProductId.get(product.id) ?? []).map((price) => {
          const authorizationTemplate = templateMap.get(price.authorizationTemplateId);
          return {
            id: price.id,
            productId: price.productId,
            productCode: product.code,
            productName: product.name,
            authorizationTemplateId: price.authorizationTemplateId,
            authorizationTemplateCode: authorizationTemplate?.code ?? '',
            authorizationTemplateName: authorizationTemplate?.name ?? '',
            code: price.code,
            name: price.name,
            billingType: price.billingType,
            billingInterval: price.billingInterval,
            amount: price.amount,
            currency: price.currency,
            grantStrategy: price.grantStrategy,
            grantDurationDays: price.grantDurationDays,
            status: price.status
          };
        })
      );

      const appTemplates = appProducts.flatMap((product) =>
        (templatesByProductId.get(product.id) ?? []).map((template) => ({
          id: template.id,
          productId: template.productId,
          productCode: product.code,
          productName: product.name,
          code: template.code,
          name: template.name,
          description: template.description,
          status: template.status
        }))
      );

      const explicitOffers = (offersByAppId.get(app.id) ?? [])
        .map((offer) => {
          const price = priceMap.get(offer.priceId);
          if (!price) {
            return null;
          }

          const product = productMap.get(price.productId);
          const authorizationTemplate = templateMap.get(price.authorizationTemplateId);
          if (!product || !authorizationTemplate) {
            return null;
          }

          return {
            id: offer.id,
            code: offer.code,
            priceId: price.id,
            priceCode: price.code,
            productId: product.id,
            productCode: product.code,
            productName: product.name,
            authorizationTemplateId: authorizationTemplate.id,
            authorizationTemplateCode: authorizationTemplate.code,
            authorizationTemplateName: authorizationTemplate.name,
            title: offer.title,
            description: offer.description,
            badge: offer.badge,
            billingType: price.billingType,
            billingInterval: price.billingInterval,
            interval: price.billingType === 'one_time' ? 'one_time' : (price.billingInterval ?? 'one_time'),
            amount: price.amount,
            priceAmount: price.amount,
            currency: price.currency,
            status: offer.status,
            isDefault: offer.isDefault,
            sortOrder: offer.sortOrder
          } satisfies HydratedOffer;
        })
        .filter((offer): offer is HydratedOffer => offer !== null)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code));

      const checkoutOffers = explicitOffers.length > 0 ? explicitOffers : this.buildFallbackOffers({ prices: appPrices });
      const normalizedMeta = this.normalizeMeta(app.meta);
      const storefront = this.readStorefront(appProducts);
      const primaryProduct =
        [...appProducts].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))[0] ?? null;

      return {
        id: app.id,
        code: app.code,
        name: app.name,
        description: app.description,
        type: app.type,
        status: app.status,
        meta: normalizedMeta,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
        tagline: storefront?.tagline ?? null,
        content: primaryProduct?.content ?? null,
        iconUrl: storefront?.iconUrl ?? null,
        coverUrl: storefront?.coverUrl ?? null,
        screenshots: primaryProduct?.screenshots ?? [],
        highlights: primaryProduct?.highlights ?? [],
        faq: primaryProduct?.faq ?? [],
        links: primaryProduct?.links ?? [],
        category: storefront?.category ?? null,
        sortOrder: primaryProduct?.sortOrder ?? 0,
        storefront,
        products: appProducts,
        prices: appPrices,
        authorizationTemplates: appTemplates,
        checkoutOffers,
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
    const matched = secrets.find((secret) => this.isSecretUsable(secret) && verifyPassword(plainSecret, secret.secretHash));

    if (!matched) {
      throw httpError(401, 'Invalid app secret');
    }

    const touched = await new AppRepository(this.db).markAppSecretUsed(matched.id);
    const secret = touched ?? matched;

    await new EventService(this.db).capture({
      appId: app.id,
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

  async getAppCatalog(appCode: string) {
    const app = await this.getPublicApp(appCode);
    const products = app.products.filter((product) => product.status === 'active');
    const allowedProductIds = new Set(products.map((product) => product.id));
    const prices = app.prices.filter((price) => allowedProductIds.has(price.productId) && price.status === 'active');
    const authorizationTemplates = app.authorizationTemplates.filter((template) => allowedProductIds.has(template.productId) && template.status === 'active');
    const offers = app.checkoutOffers.filter((offer) => offer.status === 'active');

    return {
      app,
      products,
      prices,
      authorizationTemplates,
      priceAuthorizations: prices.map((price) => ({
        priceId: price.id,
        authorizationTemplateId: price.authorizationTemplateId,
        value: null
      })),
      offers
    };
  }

  async resolveCheckoutOffer(
    appCode: string,
    input: {
      priceCode?: string;
      offerCode?: string;
    }
  ) {
    const catalog = await this.getAppCatalog(appCode);
    const activeOffers = catalog.offers;

    if (activeOffers.length === 0) {
      throw httpError(422, 'No active checkout offers are configured for this app');
    }

    let offer =
      (input.offerCode ? activeOffers.find((item) => item.code === input.offerCode) : null) ??
      null;

    if (input.offerCode && !offer) {
      throw httpError(404, `Checkout offer not found: ${input.offerCode}`);
    }

    if (!offer && input.priceCode) {
      const matchedOffers = activeOffers.filter((item) => item.priceCode === input.priceCode);
      if (matchedOffers.length === 1) {
        [offer] = matchedOffers;
      } else if (matchedOffers.length > 1) {
        offer = matchedOffers.find((item) => item.isDefault) ?? matchedOffers[0] ?? null;
      } else {
        throw httpError(404, `Checkout price is not available for this app: ${input.priceCode}`);
      }
    }

    if (!offer) {
      offer = activeOffers.find((item) => item.isDefault) ?? activeOffers[0] ?? null;
    }

    if (!offer) {
      throw httpError(404, 'Checkout offer not found');
    }

    const product = catalog.products.find((item) => item.id === offer.productId);
    const price = catalog.prices.find((item) => item.id === offer.priceId);
    const authorizationTemplate = catalog.authorizationTemplates.find((item) => item.id === offer.authorizationTemplateId);

    if (!product || !price || !authorizationTemplate) {
      throw httpError(500, 'Checkout offer is missing related product, price or authorization template');
    }

    return {
      app: catalog.app,
      product,
      price,
      authorizationTemplate,
      offer
    };
  }

  async listUserAuthorizationsForApp(appCode: string, userId: string) {
    const app = await this.getPublicApp(appCode);
    const allowedProductCodes = new Set(app.products.map((product) => product.code));
    const authorizations = await new LicenseService(this.db).listUserAuthorizations(userId);

    return {
      app,
      items: authorizations.items.filter((item) => item.product && allowedProductCodes.has(item.product.code)),
      summary: authorizations.summary.filter((item) => allowedProductCodes.has(item.productCode))
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
      apiBaseUrl?: string;
      callbackUrl?: string;
      callbackSecret?: string;
      allowedOrigins?: string[];
      repoUrl?: string;
      repoBranch?: string;
      manifestPath?: string;
      manifestUrl?: string;
      offers?: CheckoutOfferInput[];
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

    const allowedProductIds = new Set(products.map((product) => product.id));
    const offers = [
      ...new Map(
        (input.offers ?? []).map((offer, index) => [
          offer.code.trim(),
          {
            code: offer.code.trim(),
            priceCode: offer.priceCode.trim(),
            title: offer.title.trim(),
            description: offer.description?.trim() || null,
            badge: offer.badge?.trim() || null,
            status: offer.status,
            isDefault: offer.isDefault === true,
            sortOrder: offer.sortOrder ?? index
          }
        ])
      ).values()
    ].filter((offer) => offer.code && offer.priceCode && offer.title);

    const priceCodes = [...new Set(offers.map((offer) => offer.priceCode))];
    const priceRecords = priceCodes.length > 0 ? await licenseRepository.listPricesByCodes(priceCodes) : [];

    if (priceRecords.length !== priceCodes.length) {
      const found = new Set(priceRecords.map((price) => price.code));
      const missing = priceCodes.filter((code) => !found.has(code));
      throw httpError(404, `Offer prices not found: ${missing.join(', ')}`);
    }

    const disallowedPrices = priceRecords.filter((price) => !allowedProductIds.has(price.productId));
    if (disallowedPrices.length > 0) {
      throw httpError(422, `Offer prices are not available to this app: ${disallowedPrices.map((price) => price.code).join(', ')}`);
    }

    const normalizedMeta = {
      ...(input.meta ?? {}),
      apiConfig: {
        baseUrl: input.apiBaseUrl?.trim() || null,
        authMode: 'app_secret'
      },
      callbackConfig: {
        url: input.callbackUrl?.trim() || null,
        secret: input.callbackSecret?.trim() || null,
        allowedOrigins: input.allowedOrigins ?? []
      },
      deliveryManifestSource: {
        repoUrl: input.repoUrl?.trim() || '',
        repoBranch: input.repoBranch?.trim() || 'main',
        manifestPath: input.manifestPath?.trim() || 'fd-delivery.manifest.json',
        manifestUrl: input.manifestUrl?.trim() || ''
      }
    };

    await this.db.transaction(async (tx) => {
      const repository = new AppRepository(tx as DbClient);
      const app = await repository.upsertApp({
        code: appCode,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        type: input.type,
        status: input.status,
        meta: normalizedMeta
      });

      await repository.replaceAppProducts(
        app.id,
        products.map((product) => product.id)
      );

      const priceMap = new Map(priceRecords.map((price) => [price.code, price]));
      await new LicenseRepository(tx as DbClient).replaceAppCheckoutOffers(
        app.id,
        offers.map((offer, index) => ({
          priceId: priceMap.get(offer.priceCode)?.id ?? '',
          code: offer.code,
          title: offer.title,
          description: offer.description,
          badge: offer.badge,
          status: offer.status,
          isDefault: offer.isDefault || (!offers.some((item) => item.isDefault) && index === 0),
          sortOrder: offer.sortOrder
        }))
      );

      await new EventService(tx as DbClient).capture({
        userId: actorUserId,
        appId: app.id,
        eventName: 'app.upserted',
        properties: {
          appCode,
          productCodes,
          offerCodes: offers.map((offer) => offer.code),
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
      appId: app.id,
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
      appId: app.id,
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

    const nextSource = {
      repoUrl: input.repoUrl?.trim() || currentSource.repoUrl,
      repoBranch: input.repoBranch?.trim() || currentSource.repoBranch || 'main',
      manifestPath: input.manifestPath?.trim() || currentSource.manifestPath || 'fd-delivery.manifest.json',
      manifestUrl: input.manifestUrl?.trim() || currentSource.manifestUrl
    };

    const fetched = await this.fetchDeliveryManifestWithFallback(nextSource);
    const nextMeta = {
      ...meta,
      deliveryManifest: fetched.manifest,
      deliveryManifestSource: nextSource
    };

    await new AppRepository(this.db).updateAppMetaByCode(appCode, nextMeta);

    await new EventService(this.db).capture({
      userId: actorUserId,
      appId: app.id,
      eventName: 'app.delivery_manifest_synced',
      properties: {
        appCode: app.code,
        source: fetched.source,
        manifestUrl: fetched.manifestUrl
      }
    });

    return this.getManagedApp(appCode);
  }
}
