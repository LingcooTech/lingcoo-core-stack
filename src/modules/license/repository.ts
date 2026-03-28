import { and, desc, eq, gte, inArray, isNull, or } from 'drizzle-orm';

import { entitlements, features, planFeatures, plans, products } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class LicenseRepository {
  constructor(private readonly db: DbExecutor) {}

  async listProducts() {
    return this.db.select().from(products).orderBy(desc(products.createdAt));
  }

  async listPlans() {
    return this.db.select().from(plans).orderBy(desc(plans.createdAt));
  }

  async listFeatures() {
    return this.db.select().from(features).orderBy(desc(features.createdAt));
  }

  async listPlanFeatureMappings() {
    return this.db.select().from(planFeatures);
  }

  async getPlanByCode(code: string) {
    const [plan] = await this.db.select().from(plans).where(eq(plans.code, code)).limit(1);
    return plan ?? null;
  }

  async getPlanById(planId: string) {
    const [plan] = await this.db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    return plan ?? null;
  }

  async listPlansByIds(planIds: string[]) {
    if (planIds.length === 0) {
      return [];
    }

    return this.db.select().from(plans).where(inArray(plans.id, planIds));
  }

  async getProductById(productId: string) {
    const [product] = await this.db.select().from(products).where(eq(products.id, productId)).limit(1);
    return product ?? null;
  }

  async listPlanFeatureMappingsByPlanId(planId: string) {
    return this.db.select().from(planFeatures).where(eq(planFeatures.planId, planId));
  }

  async listFeaturesByIds(featureIds: string[]) {
    if (featureIds.length === 0) {
      return [];
    }

    return this.db.select().from(features).where(inArray(features.id, featureIds));
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

  async deleteEntitlementsBySource(sourceType: 'order' | 'subscription' | 'grant' | 'trial', sourceId: string) {
    await this.db
      .delete(entitlements)
      .where(and(eq(entitlements.sourceType, sourceType), eq(entitlements.sourceId, sourceId)));
  }

  async createEntitlements(
    values: Array<{
      userId: string;
      productId: string;
      featureId: string;
      sourceType: 'order' | 'subscription' | 'grant' | 'trial';
      sourceId?: string | null;
      status: 'active' | 'inactive' | 'cancelled' | 'expired';
      startsAt?: Date | null;
      expiresAt?: Date | null;
      meta?: Record<string, unknown>;
    }>
  ) {
    if (values.length === 0) {
      return [];
    }

    return this.db.insert(entitlements).values(values).returning();
  }

  async listEffectiveEntitlementsByUserId(userId: string, now = new Date()) {
    return this.db
      .select()
      .from(entitlements)
      .where(
        and(
          eq(entitlements.userId, userId),
          eq(entitlements.status, 'active'),
          or(isNull(entitlements.expiresAt), gte(entitlements.expiresAt, now))
        )
      )
      .orderBy(desc(entitlements.createdAt));
  }

  async listEffectiveEntitlementsByUserIdAndProductId(userId: string, productId: string, now = new Date()) {
    return this.db
      .select()
      .from(entitlements)
      .where(
        and(
          eq(entitlements.userId, userId),
          eq(entitlements.productId, productId),
          eq(entitlements.status, 'active'),
          or(isNull(entitlements.expiresAt), gte(entitlements.expiresAt, now))
        )
      )
      .orderBy(desc(entitlements.createdAt));
  }
}
