import { and, desc, eq, gte, inArray, isNull, ne, or } from 'drizzle-orm';

import {
  authorizationGrants,
  authorizationTemplates,
  checkoutOffers,
  prices,
  products
} from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class LicenseRepository {
  constructor(private readonly db: DbExecutor) {}

  async listProducts() {
    return this.db.select().from(products).orderBy(desc(products.sortOrder), products.name);
  }

  async getProductByCode(code: string) {
    const [product] = await this.db.select().from(products).where(eq(products.code, code)).limit(1);
    return product ?? null;
  }

  async getProductById(productId: string) {
    const [product] = await this.db.select().from(products).where(eq(products.id, productId)).limit(1);
    return product ?? null;
  }

  async listProductsByIds(productIds: string[]) {
    if (productIds.length === 0) {
      return [];
    }

    return this.db.select().from(products).where(inArray(products.id, productIds));
  }

  async listProductsByCodes(productCodes: string[]) {
    if (productCodes.length === 0) {
      return [];
    }

    return this.db.select().from(products).where(inArray(products.code, productCodes));
  }

  async upsertProduct(input: {
    code: string;
    name: string;
    tagline?: string | null;
    description?: string | null;
    content?: string | null;
    iconUrl?: string | null;
    coverUrl?: string | null;
    screenshots?: unknown[];
    highlights?: unknown[];
    faq?: unknown[];
    links?: unknown[];
    category?: string | null;
    deliveryMode?: 'direct_access' | 'one_click_deploy';
    sortOrder?: number;
    status: 'active' | 'inactive' | 'cancelled' | 'expired';
    meta?: Record<string, unknown>;
  }) {
    const now = new Date();
    const [product] = await this.db
      .insert(products)
      .values({
        code: input.code,
        name: input.name,
        tagline: input.tagline ?? null,
        description: input.description ?? null,
        content: input.content ?? null,
        iconUrl: input.iconUrl ?? null,
        coverUrl: input.coverUrl ?? null,
        screenshots: input.screenshots ?? [],
        highlights: input.highlights ?? [],
        faq: input.faq ?? [],
        links: input.links ?? [],
        category: input.category ?? null,
        deliveryMode: input.deliveryMode ?? 'direct_access',
        sortOrder: input.sortOrder ?? 0,
        status: input.status,
        meta: input.meta ?? {},
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: products.code,
        set: {
          name: input.name,
          tagline: input.tagline ?? null,
          description: input.description ?? null,
          content: input.content ?? null,
          iconUrl: input.iconUrl ?? null,
          coverUrl: input.coverUrl ?? null,
          screenshots: input.screenshots ?? [],
          highlights: input.highlights ?? [],
          faq: input.faq ?? [],
          links: input.links ?? [],
          category: input.category ?? null,
          deliveryMode: input.deliveryMode ?? 'direct_access',
          sortOrder: input.sortOrder ?? 0,
          status: input.status,
          meta: input.meta ?? {},
          updatedAt: now
        }
      })
      .returning();

    return product;
  }

  async listAuthorizationTemplates() {
    return this.db.select().from(authorizationTemplates).orderBy(desc(authorizationTemplates.createdAt));
  }

  async listAuthorizationTemplatesByProductId(productId: string) {
    return this.db.select().from(authorizationTemplates).where(eq(authorizationTemplates.productId, productId));
  }

  async listAuthorizationTemplatesByIds(templateIds: string[]) {
    if (templateIds.length === 0) {
      return [];
    }

    return this.db.select().from(authorizationTemplates).where(inArray(authorizationTemplates.id, templateIds));
  }

  async getAuthorizationTemplateByCode(code: string) {
    const [template] = await this.db
      .select()
      .from(authorizationTemplates)
      .where(eq(authorizationTemplates.code, code))
      .limit(1);

    return template ?? null;
  }

  async getAuthorizationTemplateById(templateId: string) {
    const [template] = await this.db
      .select()
      .from(authorizationTemplates)
      .where(eq(authorizationTemplates.id, templateId))
      .limit(1);

    return template ?? null;
  }

  async upsertAuthorizationTemplate(input: {
    productId: string;
    code: string;
    name: string;
    description?: string | null;
    status: 'active' | 'inactive' | 'cancelled' | 'expired';
    meta?: Record<string, unknown>;
  }) {
    const now = new Date();
    const [template] = await this.db
      .insert(authorizationTemplates)
      .values({
        productId: input.productId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        status: input.status,
        meta: input.meta ?? {},
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: authorizationTemplates.code,
        set: {
          productId: input.productId,
          name: input.name,
          description: input.description ?? null,
          status: input.status,
          meta: input.meta ?? {},
          updatedAt: now
        }
      })
      .returning();

    return template;
  }

  async listPrices() {
    return this.db.select().from(prices).orderBy(desc(prices.createdAt));
  }

  async listPricesByProductIds(productIds: string[]) {
    if (productIds.length === 0) {
      return [];
    }

    return this.db.select().from(prices).where(inArray(prices.productId, productIds));
  }

  async listPricesByProductId(productId: string) {
    return this.db.select().from(prices).where(eq(prices.productId, productId));
  }

  async listPricesByIds(priceIds: string[]) {
    if (priceIds.length === 0) {
      return [];
    }

    return this.db.select().from(prices).where(inArray(prices.id, priceIds));
  }

  async listPricesByCodes(priceCodes: string[]) {
    if (priceCodes.length === 0) {
      return [];
    }

    return this.db.select().from(prices).where(inArray(prices.code, priceCodes));
  }

  async getPriceByCode(code: string) {
    const [price] = await this.db.select().from(prices).where(eq(prices.code, code)).limit(1);
    return price ?? null;
  }

  async getPriceById(priceId: string) {
    const [price] = await this.db.select().from(prices).where(eq(prices.id, priceId)).limit(1);
    return price ?? null;
  }

  async upsertPrice(input: {
    productId: string;
    authorizationTemplateId: string;
    code: string;
    name: string;
    billingProvider?: string;
    billingPriceId?: string | null;
    billingType: 'one_time' | 'recurring';
    billingInterval?: 'month' | 'year' | null;
    amount: number;
    currency: string;
    grantStrategy: 'lifetime' | 'fixed_duration' | 'subscription_period';
    grantDurationDays?: number | null;
    status: 'active' | 'inactive' | 'cancelled' | 'expired';
    meta?: Record<string, unknown>;
  }) {
    const now = new Date();
    const [price] = await this.db
      .insert(prices)
      .values({
        productId: input.productId,
        authorizationTemplateId: input.authorizationTemplateId,
        code: input.code,
        name: input.name,
        billingProvider: input.billingProvider ?? 'self_hosted',
        billingPriceId: input.billingPriceId ?? null,
        billingType: input.billingType,
        billingInterval: input.billingInterval ?? null,
        amount: input.amount,
        currency: input.currency,
        grantStrategy: input.grantStrategy,
        grantDurationDays: input.grantDurationDays ?? null,
        status: input.status,
        meta: input.meta ?? {},
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: prices.code,
        set: {
          productId: input.productId,
          authorizationTemplateId: input.authorizationTemplateId,
          name: input.name,
          billingProvider: input.billingProvider ?? 'self_hosted',
          billingPriceId: input.billingPriceId ?? null,
          billingType: input.billingType,
          billingInterval: input.billingInterval ?? null,
          amount: input.amount,
          currency: input.currency,
          grantStrategy: input.grantStrategy,
          grantDurationDays: input.grantDurationDays ?? null,
          status: input.status,
          meta: input.meta ?? {},
          updatedAt: now
        }
      })
      .returning();

    return price;
  }

  async listCheckoutOffers() {
    return this.db.select().from(checkoutOffers).orderBy(checkoutOffers.sortOrder, checkoutOffers.code);
  }

  async listCheckoutOffersByAppIds(appIds: string[]) {
    if (appIds.length === 0) {
      return [];
    }

    return this.db.select().from(checkoutOffers).where(inArray(checkoutOffers.appId, appIds));
  }

  async listCheckoutOffersByIds(offerIds: string[]) {
    if (offerIds.length === 0) {
      return [];
    }

    return this.db.select().from(checkoutOffers).where(inArray(checkoutOffers.id, offerIds));
  }

  async getCheckoutOfferByCode(code: string) {
    const [offer] = await this.db.select().from(checkoutOffers).where(eq(checkoutOffers.code, code)).limit(1);
    return offer ?? null;
  }

  async replaceAppCheckoutOffers(
    appId: string,
    values: Array<{
      priceId: string;
      code: string;
      title: string;
      description?: string | null;
      badge?: string | null;
      status: 'active' | 'inactive' | 'cancelled' | 'expired';
      isDefault?: boolean;
      sortOrder?: number;
    }>
  ) {
    await this.db.delete(checkoutOffers).where(eq(checkoutOffers.appId, appId));

    if (values.length === 0) {
      return [];
    }

    return this.db
      .insert(checkoutOffers)
      .values(
        values.map((value, index) => ({
          appId,
          priceId: value.priceId,
          code: value.code,
          title: value.title,
          description: value.description ?? null,
          badge: value.badge ?? null,
          status: value.status,
          isDefault: value.isDefault ?? index === 0,
          sortOrder: value.sortOrder ?? index,
          createdAt: new Date(),
          updatedAt: new Date()
        }))
      )
      .returning();
  }

  async findAuthorizationGrantById(grantId: string) {
    const [grant] = await this.db
      .select()
      .from(authorizationGrants)
      .where(eq(authorizationGrants.id, grantId))
      .limit(1);

    return grant ?? null;
  }

  async listRecentAuthorizationGrants(limit = 50) {
    return this.db.select().from(authorizationGrants).orderBy(desc(authorizationGrants.createdAt)).limit(limit);
  }

  async listAuthorizationGrantsBySource(sourceType: 'subscription' | 'order' | 'manual' | 'trial', sourceId: string) {
    return this.db
      .select()
      .from(authorizationGrants)
      .where(and(eq(authorizationGrants.sourceType, sourceType), eq(authorizationGrants.sourceId, sourceId)))
      .orderBy(desc(authorizationGrants.createdAt));
  }

  async listEffectiveAuthorizationGrantsByUserId(userId: string) {
    const now = new Date();
    return this.db
      .select()
      .from(authorizationGrants)
      .where(
        and(
          eq(authorizationGrants.userId, userId),
          eq(authorizationGrants.status, 'active'),
          or(isNull(authorizationGrants.expiresAt), gte(authorizationGrants.expiresAt, now))
        )
      )
      .orderBy(desc(authorizationGrants.createdAt));
  }

  async listEffectiveAuthorizationGrantsByUserIdAndProductId(userId: string, productId: string) {
    const now = new Date();
    return this.db
      .select()
      .from(authorizationGrants)
      .where(
        and(
          eq(authorizationGrants.userId, userId),
          eq(authorizationGrants.productId, productId),
          eq(authorizationGrants.status, 'active'),
          or(isNull(authorizationGrants.expiresAt), gte(authorizationGrants.expiresAt, now))
        )
      )
      .orderBy(desc(authorizationGrants.createdAt));
  }

  async deleteAuthorizationGrantsBySource(sourceType: 'subscription' | 'order' | 'manual' | 'trial', sourceId: string) {
    return this.db
      .delete(authorizationGrants)
      .where(and(eq(authorizationGrants.sourceType, sourceType), eq(authorizationGrants.sourceId, sourceId)));
  }

  async createAuthorizationGrants(
    values: Array<{
      userId: string;
      productId: string;
      authorizationTemplateId: string;
      priceId?: string | null;
      sourceType: 'subscription' | 'order' | 'manual' | 'trial';
      sourceId?: string | null;
      status?: 'active' | 'inactive' | 'cancelled' | 'expired';
      startsAt?: Date | null;
      expiresAt?: Date | null;
      meta?: Record<string, unknown>;
    }>
  ) {
    if (values.length === 0) {
      return [];
    }

    return this.db
      .insert(authorizationGrants)
      .values(
        values.map((value) => ({
          userId: value.userId,
          productId: value.productId,
          authorizationTemplateId: value.authorizationTemplateId,
          priceId: value.priceId ?? null,
          sourceType: value.sourceType,
          sourceId: value.sourceId ?? null,
          status: value.status ?? 'active',
          startsAt: value.startsAt ?? null,
          expiresAt: value.expiresAt ?? null,
          meta: value.meta ?? {},
          createdAt: new Date(),
          updatedAt: new Date()
        }))
      )
      .returning();
  }

  async revokeAuthorizationGrant(grantId: string) {
    const [grant] = await this.db
      .update(authorizationGrants)
      .set({
        status: 'cancelled',
        updatedAt: new Date()
      })
      .where(and(eq(authorizationGrants.id, grantId), ne(authorizationGrants.status, 'cancelled')))
      .returning();

    return grant ?? null;
  }

  async revokeAuthorizationGrantsBySource(sourceType: 'subscription' | 'order' | 'manual' | 'trial', sourceId: string) {
    return this.db
      .update(authorizationGrants)
      .set({
        status: 'cancelled',
        updatedAt: new Date()
      })
      .where(
        and(
          eq(authorizationGrants.sourceType, sourceType),
          eq(authorizationGrants.sourceId, sourceId),
          ne(authorizationGrants.status, 'cancelled')
        )
      )
      .returning();
  }
}
