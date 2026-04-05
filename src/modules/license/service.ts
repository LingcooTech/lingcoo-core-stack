import type { DbClient, DbExecutor } from '../../db/types';
import { httpError } from '../../lib/errors';
import { EventService } from '../event/service';
import { LicenseRepository } from './repository';

type EffectiveEntitlement = Awaited<ReturnType<LicenseRepository['listEffectiveEntitlementsByUserId']>>[number];

function addInterval(base: Date, interval: 'month' | 'year' | 'one_time') {
  if (interval === 'one_time') {
    return null;
  }

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

  private getPlanIdFromEntitlement(item: Pick<EffectiveEntitlement, 'meta'>) {
    if (!item.meta || typeof item.meta !== 'object' || Array.isArray(item.meta)) {
      return null;
    }

    const planId = (item.meta as Record<string, unknown>).planId;
    return typeof planId === 'string' && planId.trim() ? planId.trim() : null;
  }

  async findActiveOneTimeOwnership(userId: string, productId: string) {
    const repository = new LicenseRepository(this.db);
    const items = await repository.listEffectiveEntitlementsByUserIdAndProductId(userId, productId);
    if (items.length === 0) {
      return null;
    }

    const planIds = [
      ...new Set(
        items
          .map((item) => this.getPlanIdFromEntitlement(item))
          .filter((planId): planId is string => Boolean(planId))
      )
    ];
    if (planIds.length === 0) {
      return null;
    }

    const plans = await repository.listPlansByIds(planIds);
    const oneTimePlanIds = new Set(plans.filter((plan) => plan.interval === 'one_time').map((plan) => plan.id));
    const oneTimeItems = items.filter((item) => {
      const planId = this.getPlanIdFromEntitlement(item);
      return planId ? oneTimePlanIds.has(planId) : false;
    });

    if (oneTimeItems.length === 0) {
      return null;
    }

    return {
      items: oneTimeItems
    };
  }

  async getCatalogSnapshot() {
    const repository = new LicenseRepository(this.db);
    const [products, plans, features, planFeatures] = await Promise.all([
      repository.listProducts(),
      repository.listPlans(),
      repository.listFeatures(),
      repository.listPlanFeatureMappings()
    ]);

    return {
      products,
      plans,
      features,
      planFeatures
    };
  }

  async getPlanForCheckout(planCode: string) {
    const repository = new LicenseRepository(this.db);
    const plan = await repository.getPlanByCode(planCode);

    if (!plan || plan.status !== 'active') {
      throw httpError(404, 'Plan not found or inactive');
    }

    const product = await repository.getProductById(plan.productId);
    if (!product || product.status !== 'active') {
      throw httpError(404, 'Product not found or inactive');
    }

    return {
      plan,
      product
    };
  }

  async grantEntitlementsForPlan(input: {
    userId: string;
    planId: string;
    sourceType: 'subscription' | 'order' | 'grant' | 'trial';
    sourceId?: string | null;
    startsAt?: Date;
  }) {
    const repository = new LicenseRepository(this.db);
    const plan = await repository.getPlanById(input.planId);

    if (!plan) {
      throw httpError(404, 'Plan not found');
    }

    const product = await repository.getProductById(plan.productId);
    if (!product) {
      throw httpError(404, 'Product not found');
    }

    const mappings = await repository.listPlanFeatureMappingsByPlanId(plan.id);
    if (mappings.length === 0) {
      throw httpError(422, 'Plan has no feature mappings');
    }

    const features = await repository.listFeaturesByIds(mappings.map((item) => item.featureId));
    const featureMap = new Map(features.map((feature) => [feature.id, feature]));
    const startsAt = input.startsAt ?? new Date();
    const expiresAt = addInterval(startsAt, plan.interval);

    if (plan.interval === 'one_time') {
      const ownership = await this.findActiveOneTimeOwnership(input.userId, product.id);
      const conflictingItems =
        ownership?.items.filter(
          (item) => item.sourceType !== input.sourceType || (item.sourceId ?? null) !== (input.sourceId ?? null)
        ) ?? [];

      if (conflictingItems.length > 0) {
        await new EventService(this.db).capture({
          userId: input.userId,
          productId: product.id,
          eventName: 'license.entitlements_skipped_already_owned',
          properties: {
            planId: plan.id,
            planCode: plan.code,
            sourceType: input.sourceType,
            sourceId: input.sourceId ?? null,
            existingEntitlementCount: conflictingItems.length
          }
        });

        return {
          plan,
          product,
          entitlements: conflictingItems,
          granted: false as const,
          reason: 'already_owned' as const
        };
      }
    }

    if (input.sourceId) {
      await repository.deleteEntitlementsBySource(input.sourceType, input.sourceId);
    }

    const created = await repository.createEntitlements(
      mappings
        .map((mapping) => {
          const feature = featureMap.get(mapping.featureId);
          if (!feature) {
            return null;
          }

          return {
            userId: input.userId,
            productId: product.id,
            featureId: feature.id,
            sourceType: input.sourceType,
            sourceId: input.sourceId ?? null,
            status: 'active' as const,
            startsAt,
            expiresAt,
            meta: {
              planId: plan.id,
              planCode: plan.code,
              featureCode: feature.code,
              featureValue: mapping.value
            }
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    );

    await new EventService(this.db).capture({
      userId: input.userId,
      productId: product.id,
      eventName: 'license.entitlements_granted',
      properties: {
        planId: plan.id,
        planCode: plan.code,
        featureCount: created.length,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null
      }
    });

    return {
      plan,
      product,
      entitlements: created,
      granted: true as const,
      reason: 'granted' as const
    };
  }

  async listUserEntitlements(userId: string) {
    const repository = new LicenseRepository(this.db);
    const items = await repository.listEffectiveEntitlementsByUserId(userId);
    const features = await repository.listFeaturesByIds([...new Set(items.map((item) => item.featureId))]);
    const products = await repository.listProductsByIds([...new Set(items.map((item) => item.productId))]);

    const featureMap = new Map(features.map((feature) => [feature.id, feature]));
    const productMap = new Map(products.map((product) => [product.id, product]));
    const summary = new Map<string, Set<string>>();

    const detailed = items.map((item) => {
      const feature = featureMap.get(item.featureId) ?? null;
      const product = productMap.get(item.productId) ?? null;

      if (product && feature) {
        if (!summary.has(product.code)) {
          summary.set(product.code, new Set());
        }
        summary.get(product.code)?.add(feature.code);
      }

      return {
        ...item,
        feature,
        product
      };
    });

    return {
      items: detailed,
      summary: Array.from(summary.entries()).map(([productCode, featureCodes]) => ({
        productCode,
        featureCodes: Array.from(featureCodes).sort()
      }))
    };
  }
}
