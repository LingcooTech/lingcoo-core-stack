import type { DbClient, DbExecutor } from '../../db/types';
import { httpError } from '../../lib/errors';
import { EventService } from '../event/service';
import { AppRepository } from '../app/repository';
import { LicenseRepository } from './repository';

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

  async findActiveOneTimeOwnership(userId: string, appId: string) {
    const repository = new LicenseRepository(this.db);
    const items = await repository.listEffectiveEntitlementsByUserIdAndAppId(userId, appId);
    if (items.length === 0) {
      return null;
    }

    const planIds = [...new Set(items.map((item) => item.planId))];
    const plans = await repository.listPlansByIds(planIds);
    const oneTimePlanIds = new Set(plans.filter((plan) => plan.interval === 'one_time').map((plan) => plan.id));
    const oneTimeItems = items.filter((item) => oneTimePlanIds.has(item.planId));

    if (oneTimeItems.length === 0) {
      return null;
    }

    return { items: oneTimeItems };
  }

  async getCatalogSnapshot() {
    const repository = new LicenseRepository(this.db);
    const [plans, features, planFeatures] = await Promise.all([
      repository.listPlans(),
      repository.listFeatures(),
      repository.listPlanFeatureMappings()
    ]);

    return { plans, features, planFeatures };
  }

  async getPlanForCheckout(planCode: string) {
    const repository = new LicenseRepository(this.db);
    const plan = await repository.getPlanByCode(planCode);

    if (!plan || plan.status !== 'active') {
      throw httpError(404, 'Plan not found or inactive');
    }

    const app = await new AppRepository(this.db).findAppById(plan.appId);
    if (!app || app.status !== 'active') {
      throw httpError(404, 'App not found or inactive');
    }

    return { plan, app };
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

    const app = await new AppRepository(this.db).findAppById(plan.appId);
    if (!app) {
      throw httpError(404, 'App not found');
    }

    // Validate plan has feature mappings (ensures it's a valid plan)
    const mappings = await repository.listPlanFeatureMappingsByPlanId(plan.id);
    if (mappings.length === 0) {
      throw httpError(422, 'Plan has no feature mappings');
    }

    const startsAt = input.startsAt ?? new Date();
    const expiresAt = addInterval(startsAt, plan.interval);

    if (plan.interval === 'one_time') {
      const ownership = await this.findActiveOneTimeOwnership(input.userId, app.id);
      const conflictingItems =
        ownership?.items.filter(
          (item) => item.sourceType !== input.sourceType || (item.sourceId ?? null) !== (input.sourceId ?? null)
        ) ?? [];

      if (conflictingItems.length > 0) {
        await new EventService(this.db).capture({
          userId: input.userId,
          appId: app.id,
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
          app,
          entitlement: conflictingItems[0],
          granted: false as const,
          reason: 'already_owned' as const
        };
      }
    }

    if (input.sourceId) {
      await repository.deleteEntitlementsBySource(input.sourceType, input.sourceId);
    }

    // Create a single entitlement record (per-plan granularity)
    const entitlement = await repository.createEntitlement({
      userId: input.userId,
      appId: app.id,
      planId: plan.id,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      status: 'active',
      startsAt,
      expiresAt,
      meta: {
        planCode: plan.code,
        appCode: app.code
      }
    });

    await new EventService(this.db).capture({
      userId: input.userId,
      appId: app.id,
      eventName: 'license.entitlements_granted',
      properties: {
        planId: plan.id,
        planCode: plan.code,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null
      }
    });

    return {
      plan,
      app,
      entitlement,
      granted: true as const,
      reason: 'granted' as const
    };
  }

  async listUserEntitlements(userId: string) {
    const repository = new LicenseRepository(this.db);
    const items = await repository.listEntitlementsByUserId(userId);
    const now = new Date();

    const planIds = [...new Set(items.map((item) => item.planId))];
    const appIds = [...new Set(items.map((item) => item.appId))];
    const plans = await repository.listPlansByIds(planIds);
    const apps = await new AppRepository(this.db).listAppsByIds(appIds);

    // Derive feature codes from plan_features for each entitlement
    const planFeatureMappings = new Map<string, string[]>();
    for (const plan of plans) {
      const mappings = await repository.listPlanFeatureMappingsByPlanId(plan.id);
      const featureIds = mappings.map((m) => m.featureId);
      if (featureIds.length > 0) {
        const features = await repository.listFeaturesByIds(featureIds);
        planFeatureMappings.set(plan.id, features.map((f) => f.code));
      } else {
        planFeatureMappings.set(plan.id, []);
      }
    }

    const planMap = new Map(plans.map((p) => [p.id, p]));
    const appMap = new Map(apps.map((a) => [a.id, a]));

    const detailed = items.map((item) => {
      const plan = planMap.get(item.planId) ?? null;
      const app = appMap.get(item.appId) ?? null;
      const featureCodes = planFeatureMappings.get(item.planId) ?? [];

      return {
        ...item,
        plan,
        app,
        featureCodes
      };
    });

    const summaryMap = new Map<string, Set<string>>();
    for (const item of detailed) {
      const isEffective =
        item.status === 'active' && (!item.expiresAt || item.expiresAt.getTime() >= now.getTime());
      if (item.app && isEffective) {
        if (!summaryMap.has(item.app.code)) {
          summaryMap.set(item.app.code, new Set());
        }
        for (const fc of item.featureCodes) {
          summaryMap.get(item.app.code)?.add(fc);
        }
      }
    }

    return {
      items: detailed,
      summary: Array.from(summaryMap.entries()).map(([appCode, featureCodes]) => ({
        appCode,
        featureCodes: Array.from(featureCodes).sort()
      }))
    };
  }

  async listUserEntitlementsByAppId(appId: string, userId: string) {
    const repository = new LicenseRepository(this.db);
    const items = await repository.listEffectiveEntitlementsByUserIdAndAppId(userId, appId);
    const app = await new AppRepository(this.db).findAppById(appId);

    const planIds = [...new Set(items.map((item) => item.planId))];
    const plans = await repository.listPlansByIds(planIds);

    const planFeatureMappings = new Map<string, string[]>();
    for (const plan of plans) {
      const mappings = await repository.listPlanFeatureMappingsByPlanId(plan.id);
      const featureIds = mappings.map((m) => m.featureId);
      if (featureIds.length > 0) {
        const features = await repository.listFeaturesByIds(featureIds);
        planFeatureMappings.set(plan.id, features.map((f) => f.code));
      } else {
        planFeatureMappings.set(plan.id, []);
      }
    }

    const planMap = new Map(plans.map((p) => [p.id, p]));
    const allFeatureCodes = new Set<string>();

    const detailed = items.map((item) => {
      const plan = planMap.get(item.planId) ?? null;
      const featureCodes = planFeatureMappings.get(item.planId) ?? [];
      for (const fc of featureCodes) {
        allFeatureCodes.add(fc);
      }

      return { ...item, plan, app, featureCodes };
    });

    const appCode = app?.code ?? '';

    return {
      items: detailed,
      summary: allFeatureCodes.size > 0
        ? [{
            appCode,
            featureCodes: Array.from(allFeatureCodes).sort()
          }]
        : []
    };
  }
}
