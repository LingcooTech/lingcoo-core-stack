import { randomUUID } from 'node:crypto';

import type { DbClient, DbExecutor } from '../../db/types';
import { httpError } from '../../lib/errors';
import { EventService } from '../event/service';
import { LicenseRepository } from './repository';

type EffectiveGrant = Awaited<ReturnType<LicenseRepository['listEffectiveAuthorizationGrantsByUserId']>>[number];

function addBillingInterval(base: Date, interval: 'month' | 'year') {
  const next = new Date(base);
  if (interval === 'month') {
    next.setMonth(next.getMonth() + 1);
    return next;
  }

  next.setFullYear(next.getFullYear() + 1);
  return next;
}

export class LicenseService {
  constructor(private readonly db: DbClient | DbExecutor) {}

  private normalizeRecordMeta(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  }

  private toAuthorizationTemplateSummary(template: {
    id: string;
    productId: string;
    code: string;
    name: string;
    status: 'active' | 'inactive' | 'cancelled' | 'expired';
    meta: unknown;
  }) {
    return {
      id: template.id,
      code: template.code,
      name: template.name,
      kind: this.readAuthorizationKind(template),
      productId: template.productId,
      status: template.status
    };
  }

  private readAuthorizationKind(value: { meta: unknown }) {
    const meta = this.normalizeRecordMeta(value.meta);
    const kind = meta.kind;
    return typeof kind === 'string' && kind.trim() ? kind.trim() : 'tier';
  }

  private buildGrantExpiry(input: {
    startsAt: Date;
    billingType: 'one_time' | 'recurring';
    billingInterval: 'month' | 'year' | null;
    grantStrategy: 'lifetime' | 'fixed_duration' | 'subscription_period';
    grantDurationDays: number | null;
  }) {
    if (input.grantStrategy === 'lifetime') {
      return null;
    }

    if (input.grantStrategy === 'fixed_duration') {
      if (!input.grantDurationDays || input.grantDurationDays <= 0) {
        throw httpError(422, 'Fixed-duration price requires grantDurationDays');
      }

      return new Date(input.startsAt.getTime() + input.grantDurationDays * 24 * 60 * 60 * 1000);
    }

    if (input.billingType !== 'recurring' || !input.billingInterval) {
      throw httpError(422, 'Subscription-period grants require a recurring billing interval');
    }

    return addBillingInterval(input.startsAt, input.billingInterval);
  }

  async findActiveLifetimeOwnership(userId: string, productId: string) {
    const items = await new LicenseRepository(this.db).listEffectiveAuthorizationGrantsByUserIdAndProductId(userId, productId);
    const lifetimeItems = items.filter((item) => item.expiresAt === null);

    if (lifetimeItems.length === 0) {
      return null;
    }

    return {
      items: lifetimeItems
    };
  }

  async getCatalogSnapshot() {
    const repository = new LicenseRepository(this.db);
    const [products, authorizationTemplates, prices, checkoutOffers] = await Promise.all([
      repository.listProducts(),
      repository.listAuthorizationTemplates(),
      repository.listPrices(),
      repository.listCheckoutOffers()
    ]);

    return {
      products,
      authorizationTemplates: authorizationTemplates.map((template) => this.toAuthorizationTemplateSummary(template)),
      prices: prices.map((price) => ({
        ...price,
        interval: price.billingType === 'one_time' ? 'one_time' : price.billingInterval,
        priceAmount: price.amount
      })),
      priceAuthorizations: prices.map((price) => ({
        priceId: price.id,
        authorizationTemplateId: price.authorizationTemplateId,
        value: null
      })),
      checkoutOffers,
    };
  }

  async getPriceForCheckout(priceCode: string) {
    const repository = new LicenseRepository(this.db);
    const price = await repository.getPriceByCode(priceCode);

    if (!price || price.status !== 'active') {
      throw httpError(404, 'Price not found or inactive');
    }

    const [product, authorizationTemplate] = await Promise.all([
      repository.getProductById(price.productId),
      repository.getAuthorizationTemplateById(price.authorizationTemplateId)
    ]);

    if (!product || product.status !== 'active') {
      throw httpError(404, 'Product not found or inactive');
    }

    if (!authorizationTemplate || authorizationTemplate.status !== 'active') {
      throw httpError(404, 'Authorization template not found or inactive');
    }

    return {
      price,
      product,
      authorizationTemplate
    };
  }

  async grantAuthorizationForPrice(input: {
    userId: string;
    priceId: string;
    sourceType: 'subscription' | 'order' | 'manual' | 'trial';
    sourceId?: string | null;
    startsAt?: Date;
    meta?: Record<string, unknown>;
  }) {
    const repository = new LicenseRepository(this.db);
    const price = await repository.getPriceById(input.priceId);

    if (!price) {
      throw httpError(404, 'Price not found');
    }

    const [product, authorizationTemplate] = await Promise.all([
      repository.getProductById(price.productId),
      repository.getAuthorizationTemplateById(price.authorizationTemplateId)
    ]);

    if (!product) {
      throw httpError(404, 'Product not found');
    }

    if (!authorizationTemplate) {
      throw httpError(404, 'Authorization template not found');
    }

    const startsAt = input.startsAt ?? new Date();
    const expiresAt = this.buildGrantExpiry({
      startsAt,
      billingType: price.billingType,
      billingInterval: price.billingInterval,
      grantStrategy: price.grantStrategy,
      grantDurationDays: price.grantDurationDays
    });

    if (price.grantStrategy === 'lifetime') {
      const ownership = await this.findActiveLifetimeOwnership(input.userId, product.id);
      const conflictingItems =
        ownership?.items.filter(
          (item) => item.sourceType !== input.sourceType || (item.sourceId ?? null) !== (input.sourceId ?? null)
        ) ?? [];

      if (conflictingItems.length > 0) {
        await new EventService(this.db).capture({
          userId: input.userId,
          productId: product.id,
          eventName: 'authorization.grant_skipped_already_owned',
          properties: {
            priceId: price.id,
            priceCode: price.code,
            sourceType: input.sourceType,
            sourceId: input.sourceId ?? null,
            existingGrantCount: conflictingItems.length
          }
        });

        return {
          price,
          product,
          authorizationTemplate,
          grants: conflictingItems,
          granted: false as const,
          reason: 'already_owned' as const
        };
      }
    }

    if (input.sourceId) {
      await repository.deleteAuthorizationGrantsBySource(input.sourceType, input.sourceId);
    }

    const created = await repository.createAuthorizationGrants([
      {
        userId: input.userId,
        productId: product.id,
        authorizationTemplateId: authorizationTemplate.id,
        priceId: price.id,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        startsAt,
        expiresAt,
        meta: {
          priceId: price.id,
          priceCode: price.code,
          authorizationTemplateCode: authorizationTemplate.code,
          ...input.meta
        }
      }
    ]);

    await new EventService(this.db).capture({
      userId: input.userId,
      productId: product.id,
      eventName: 'authorization.granted',
      properties: {
        priceId: price.id,
        priceCode: price.code,
        authorizationTemplateCode: authorizationTemplate.code,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null
      }
    });

    return {
      price,
      product,
      authorizationTemplate,
      grants: created,
      granted: true as const,
      reason: 'granted' as const
    };
  }

  async grantManualAuthorization(input: {
    userId: string;
    authorizationTemplateCode: string;
    expiresAt?: Date | null;
    reason?: string;
  }) {
    const repository = new LicenseRepository(this.db);
    const authorizationTemplate = await repository.getAuthorizationTemplateByCode(input.authorizationTemplateCode);

    if (!authorizationTemplate) {
      throw httpError(404, 'Authorization template not found');
    }

    const product = await repository.getProductById(authorizationTemplate.productId);
    if (!product) {
      throw httpError(404, 'Product not found');
    }

    const sourceId = randomUUID();
    const grants = await repository.createAuthorizationGrants([
      {
        userId: input.userId,
        productId: product.id,
        authorizationTemplateId: authorizationTemplate.id,
        sourceType: 'manual',
        sourceId,
        startsAt: new Date(),
        expiresAt: input.expiresAt ?? null,
        meta: {
          reason: input.reason ?? null,
          authorizationTemplateCode: authorizationTemplate.code
        }
      }
    ]);

    await new EventService(this.db).capture({
      userId: input.userId,
      productId: product.id,
      eventName: 'authorization.granted_manual',
      properties: {
        authorizationTemplateCode: authorizationTemplate.code,
        sourceId,
        expiresAt: input.expiresAt?.toISOString() ?? null,
        reason: input.reason ?? null
      }
    });

    return {
      product,
      authorizationTemplate,
      grants
    };
  }

  async listUserAuthorizations(userId: string) {
    const repository = new LicenseRepository(this.db);
    const items = await repository.listEffectiveAuthorizationGrantsByUserId(userId);
    const [products, authorizationTemplates, prices] = await Promise.all([
      repository.listProductsByIds([...new Set(items.map((item) => item.productId))]),
      repository.listAuthorizationTemplatesByIds([...new Set(items.map((item) => item.authorizationTemplateId))]),
      repository.listPricesByIds([...new Set(items.map((item) => item.priceId).filter((item): item is string => Boolean(item)))])
    ]);

    const productMap = new Map(products.map((product) => [product.id, product]));
    const templateMap = new Map(authorizationTemplates.map((template) => [template.id, template]));
    const priceMap = new Map(prices.map((price) => [price.id, price]));
    const summaryMap = new Map<string, Set<string>>();

    const detailed = items.map((item) => {
      const product = productMap.get(item.productId) ?? null;
      const authorizationTemplate = templateMap.get(item.authorizationTemplateId) ?? null;
      const price = item.priceId ? priceMap.get(item.priceId) ?? null : null;

      if (product && authorizationTemplate) {
        if (!summaryMap.has(product.code)) {
          summaryMap.set(product.code, new Set());
        }
        summaryMap.get(product.code)?.add(authorizationTemplate.code);
      }

      return {
        ...item,
        product,
        authorizationTemplate,
        price
      };
    });

    return {
      items: detailed,
      summary: Array.from(summaryMap.entries()).map(([productCode, templateCodes]) => ({
        productCode,
        authorizationTemplateCodes: Array.from(templateCodes).sort()
      }))
    };
  }
}
