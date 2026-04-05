import { and, desc, eq, gte, inArray, isNull, ne, notInArray, or } from 'drizzle-orm';

import { entitlements, features, planFeatures, plans } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class LicenseRepository {
  constructor(private readonly db: DbExecutor) {}

  async listPlans() {
    return this.db.select().from(plans).orderBy(desc(plans.createdAt));
  }

  async listPlansByAppIds(appIds: string[]) {
    if (appIds.length === 0) {
      return [];
    }

    return this.db.select().from(plans).where(inArray(plans.appId, appIds));
  }

  async listPlansByAppId(appId: string) {
    return this.db.select().from(plans).where(eq(plans.appId, appId));
  }

  async listFeatures() {
    return this.db.select().from(features).orderBy(desc(features.createdAt));
  }

  async listFeaturesByAppId(appId: string) {
    return this.db.select().from(features).where(eq(features.appId, appId));
  }

  async listPlanFeatureMappings() {
    return this.db.select().from(planFeatures);
  }

  async getPlanByCode(code: string) {
    const [plan] = await this.db.select().from(plans).where(eq(plans.code, code)).limit(1);
    return plan ?? null;
  }

  async findEntitlementById(entitlementId: string) {
    const [entitlement] = await this.db.select().from(entitlements).where(eq(entitlements.id, entitlementId)).limit(1);
    return entitlement ?? null;
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

  async listPlanFeatureMappingsByPlanId(planId: string) {
    return this.db.select().from(planFeatures).where(eq(planFeatures.planId, planId));
  }

  async listFeaturesByIds(featureIds: string[]) {
    if (featureIds.length === 0) {
      return [];
    }

    return this.db.select().from(features).where(inArray(features.id, featureIds));
  }

  async listPlansByCodes(planCodes: string[]) {
    if (planCodes.length === 0) {
      return [];
    }

    return this.db.select().from(plans).where(inArray(plans.code, planCodes));
  }

  async upsertPlan(input: {
    appId: string;
    code: string;
    name: string;
    billingProvider: string;
    billingPriceId?: string | null;
    priceAmount: number;
    currency: string;
    interval: 'month' | 'year' | 'one_time';
    meta?: Record<string, unknown>;
    status: 'active' | 'inactive' | 'cancelled' | 'expired';
  }) {
    const [plan] = await this.db
      .insert(plans)
      .values({
        appId: input.appId,
        code: input.code,
        name: input.name,
        billingProvider: input.billingProvider,
        billingPriceId: input.billingPriceId ?? null,
        priceAmount: input.priceAmount,
        currency: input.currency,
        interval: input.interval,
        meta: input.meta ?? {},
        status: input.status,
        createdAt: new Date()
      })
      .onConflictDoUpdate({
        target: plans.code,
        set: {
          appId: input.appId,
          name: input.name,
          billingProvider: input.billingProvider,
          billingPriceId: input.billingPriceId ?? null,
          priceAmount: input.priceAmount,
          currency: input.currency,
          interval: input.interval,
          meta: input.meta ?? {},
          status: input.status
        }
      })
      .returning();

    return plan;
  }

  async upsertFeature(input: {
    appId: string;
    code: string;
    name: string;
    kind: string;
    status: 'active' | 'inactive' | 'cancelled' | 'expired';
  }) {
    const [feature] = await this.db
      .insert(features)
      .values({
        appId: input.appId,
        code: input.code,
        name: input.name,
        kind: input.kind,
        status: input.status,
        createdAt: new Date()
      })
      .onConflictDoUpdate({
        target: features.code,
        set: {
          appId: input.appId,
          name: input.name,
          kind: input.kind,
          status: input.status
        }
      })
      .returning();

    return feature;
  }

  async replacePlanFeatureMappings(
    planId: string,
    featureIds: string[],
    featureValue: Record<string, unknown> = { enabled: true }
  ) {
    await this.db.delete(planFeatures).where(eq(planFeatures.planId, planId));

    if (featureIds.length === 0) {
      return [];
    }

    return this.db
      .insert(planFeatures)
      .values(
        featureIds.map((featureId) => ({
          planId,
          featureId,
          value: featureValue
        }))
      )
      .returning();
  }

  async deactivatePlansByAppExceptCodes(appId: string, retainedCodes: string[]) {
    return this.db
      .update(plans)
      .set({ status: 'inactive' })
      .where(
        retainedCodes.length > 0
          ? and(eq(plans.appId, appId), notInArray(plans.code, retainedCodes))
          : eq(plans.appId, appId)
      )
      .returning();
  }

  async deactivateFeaturesByAppExceptCodes(appId: string, retainedCodes: string[]) {
    return this.db
      .update(features)
      .set({ status: 'inactive' })
      .where(
        retainedCodes.length > 0
          ? and(eq(features.appId, appId), notInArray(features.code, retainedCodes))
          : eq(features.appId, appId)
      )
      .returning();
  }

  async updatePlanById(
    planId: string,
    input: {
      priceAmount: number;
      currency: string;
      status: 'active' | 'inactive' | 'cancelled' | 'expired';
    }
  ) {
    const [plan] = await this.db
      .update(plans)
      .set({
        priceAmount: input.priceAmount,
        currency: input.currency,
        status: input.status
      })
      .where(eq(plans.id, planId))
      .returning();

    return plan ?? null;
  }

  async deleteEntitlementsBySource(sourceType: 'order' | 'subscription' | 'grant' | 'trial', sourceId: string) {
    await this.db
      .delete(entitlements)
      .where(and(eq(entitlements.sourceType, sourceType), eq(entitlements.sourceId, sourceId)));
  }

  async createEntitlement(input: {
    userId: string;
    appId: string;
    planId: string;
    sourceType: 'order' | 'subscription' | 'grant' | 'trial';
    sourceId?: string | null;
    status: 'active' | 'inactive' | 'cancelled' | 'expired';
    startsAt?: Date | null;
    expiresAt?: Date | null;
    meta?: Record<string, unknown>;
  }) {
    const [entitlement] = await this.db
      .insert(entitlements)
      .values(input)
      .returning();

    return entitlement;
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

  async listEffectiveEntitlementsByUserIdAndAppId(userId: string, appId: string, now = new Date()) {
    return this.db
      .select()
      .from(entitlements)
      .where(
        and(
          eq(entitlements.userId, userId),
          eq(entitlements.appId, appId),
          eq(entitlements.status, 'active'),
          or(isNull(entitlements.expiresAt), gte(entitlements.expiresAt, now))
        )
      )
      .orderBy(desc(entitlements.createdAt));
  }

  async listRecentEntitlements(limit = 50) {
    return this.db.select().from(entitlements).orderBy(desc(entitlements.createdAt)).limit(limit);
  }

  async listEntitlementsBySource(sourceType: 'order' | 'subscription' | 'grant' | 'trial', sourceId: string) {
    return this.db
      .select()
      .from(entitlements)
      .where(and(eq(entitlements.sourceType, sourceType), eq(entitlements.sourceId, sourceId)))
      .orderBy(desc(entitlements.createdAt));
  }

  async cancelEntitlementById(entitlementId: string, effectiveAt = new Date()) {
    const [entitlement] = await this.db
      .update(entitlements)
      .set({
        status: 'cancelled',
        expiresAt: effectiveAt
      })
      .where(and(eq(entitlements.id, entitlementId), ne(entitlements.status, 'cancelled')))
      .returning();

    return entitlement ?? null;
  }

  async cancelEntitlementsBySource(
    sourceType: 'order' | 'subscription' | 'grant' | 'trial',
    sourceId: string,
    effectiveAt = new Date()
  ) {
    return this.db
      .update(entitlements)
      .set({
        status: 'cancelled',
        expiresAt: effectiveAt
      })
      .where(
        and(
          eq(entitlements.sourceType, sourceType),
          eq(entitlements.sourceId, sourceId),
          ne(entitlements.status, 'cancelled')
        )
      )
      .returning();
  }
}
