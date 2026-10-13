import { createHash } from 'node:crypto';
import { acquireTransactionLock } from '../../db/locks';
import { freeAcquisitionPlan } from '../../lib/free-acquisition';
import { readPublishedComposeRelease } from '../app/public';
import { billingPeriodEnd } from '../../lib/billing-period';
import { queryBatch } from '../../db/query-batch';
import { pickLicenseDependencies, type LicenseDependencies } from './dependencies';
import type { DbExecutor } from '../../db/types';
import { normalizeDeploymentPolicy } from '../../lib/deployment-policy';
import { httpError } from '../../lib/errors';

import { createAppAccess } from '../app/public';
import { LicenseRepository } from './repository';

function normalizeMeta(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export class LicenseService {
  private readonly capabilities: LicenseDependencies;
  constructor(
    capabilities: LicenseDependencies,
    private readonly db: DbExecutor,
  ) {
    this.capabilities = pickLicenseDependencies(capabilities);
  }

  async claimFreeApplication(appCode: string, userId: string) {
    return this.db.transaction(async (tx) => {
      await acquireTransactionLock(tx, 'app:publication:' + appCode);
      const access = createAppAccess(tx),
        app = await access.findAppByCode(appCode);
      if (!app || app.status !== 'active') throw httpError(404, '应用不存在或未上架');
      const meta = normalizeMeta(app.meta);
      if (meta.acquisition !== 'free') throw httpError(422, '该应用不支持免费领取');
      if (meta.deliveryProtocol === 'compose_v2') {
        if (typeof meta.deliveryReleaseId !== 'string')
          throw httpError(422, '应用尚未选择交付版本');
        const release = await readPublishedComposeRelease(tx, app.id, meta.deliveryReleaseId);
        if (release.definition.app.acquisition !== 'free')
          throw httpError(422, '交付版本不是免费应用');
      }
      const repo = new LicenseRepository(tx);
      const plan = freeAcquisitionPlan(
        await repo.listPlansByAppId(app.id),
        await repo.listFeaturesByAppId(app.id),
        await repo.listPlanFeatureMappings(),
      );
      if (!plan || (await access.listOffersByAppId(app.id)).some((o) => o.status === 'active'))
        throw httpError(422, '免费领取配置尚未完成');
      // Stable, domain-separated source identity: retries never create another grant,
      // and a cancelled grant cannot be resurrected by claiming again.
      const hash = createHash('sha256')
        .update('stack:free-claim:v1:' + app.id + ':' + userId)
        .digest('hex');
      const sourceId = [
        hash.slice(0, 8),
        hash.slice(8, 12),
        '5' + hash.slice(13, 16),
        '8' + hash.slice(17, 20),
        hash.slice(20, 32),
      ].join('-');
      const previous = await repo.listEntitlementsBySource('grant', sourceId);
      if (previous.length) {
        const item = previous[0]!;
        if (
          item.userId !== userId ||
          item.appId !== app.id ||
          item.status !== 'active' ||
          (item.startsAt && item.startsAt > this.capabilities.now()) ||
          (item.expiresAt && item.expiresAt <= this.capabilities.now())
        )
          throw httpError(409, '已有领取记录不可再次领取，请联系支持');
        return { entitlementId: item.id, alreadyOwned: true };
      }
      const service = new LicenseService(this.capabilities, tx);
      const owned = await service.findActiveOneTimeOwnership(userId, app.id);
      if (owned?.items[0]) return { entitlementId: owned.items[0].id, alreadyOwned: true };
      const result = await service.grantEntitlementsForPlan({
        userId,
        planId: plan.id,
        sourceType: 'grant',
        sourceId,
      });
      if (!result.entitlement) throw httpError(409, '领取权益未完成');
      await this.capabilities.createEventService(tx).capture({
        userId,
        appId: app.id,
        eventName: 'app.free_claimed',
        properties: { entitlementId: result.entitlement.id, planId: plan.id },
      });
      return { entitlementId: result.entitlement.id, alreadyOwned: !result.granted };
    });
  }

  async findActiveOneTimeOwnership(userId: string, appId: string, planId?: string) {
    const repository = new LicenseRepository(this.db);
    const items = planId
      ? await repository.listEffectiveEntitlementsByUserIdAndAppIdAndPlanId(userId, appId, planId)
      : await repository.listEffectiveEntitlementsByUserIdAndAppId(userId, appId);
    if (items.length === 0) {
      return null;
    }

    const planIds = [...new Set(items.map((item) => item.planId))];
    const plans = await repository.listPlansByIds(planIds);
    const oneTimePlanIds = new Set(
      plans.filter((plan) => plan.interval === 'one_time').map((plan) => plan.id),
    );
    const oneTimeItems = items.filter((item) => oneTimePlanIds.has(item.planId));

    if (oneTimeItems.length === 0) {
      return null;
    }

    return { items: oneTimeItems };
  }

  async getCatalogSnapshot() {
    const repository = new LicenseRepository(this.db);
    const [plans, features, planFeatures] = await queryBatch(this.db, [
      () => repository.listPlans(),
      () => repository.listFeatures(),
      () => repository.listPlanFeatureMappings(),
    ]);

    return { plans, features, planFeatures };
  }

  async getPlanForCheckout(planCode: string) {
    const repository = new LicenseRepository(this.db);
    const plan = await repository.getPlanByCode(planCode);

    if (!plan || plan.status !== 'active') {
      throw httpError(404, 'Plan not found or inactive');
    }

    const app = await createAppAccess(this.db).findAppById(plan.appId);
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

    const app = await createAppAccess(this.db).findAppById(plan.appId);
    if (!app) {
      throw httpError(404, 'App not found');
    }

    // Validate plan has feature mappings (ensures it's a valid plan)
    const mappings = await repository.listPlanFeatureMappingsByPlanId(plan.id);
    if (mappings.length === 0) {
      throw httpError(422, 'Plan has no feature mappings');
    }

    const startsAt = input.startsAt ?? this.capabilities.now();
    const expiresAt =
      plan.interval === 'one_time' ? null : billingPeriodEnd(startsAt, plan.interval);

    const deploymentPolicy = normalizeDeploymentPolicy(normalizeMeta(plan.meta).deploymentPolicy);

    if (plan.interval === 'one_time' && !deploymentPolicy.allowMultiplePurchases) {
      const ownership = await this.findActiveOneTimeOwnership(input.userId, app.id, plan.id);
      const conflictingItems =
        ownership?.items.filter(
          (item) =>
            item.sourceType !== input.sourceType ||
            (item.sourceId ?? null) !== (input.sourceId ?? null),
        ) ?? [];

      if (conflictingItems.length > 0) {
        await this.capabilities.createEventService(this.db).capture({
          userId: input.userId,
          appId: app.id,
          eventName: 'license.entitlements_skipped_already_owned',
          properties: {
            planId: plan.id,
            planCode: plan.code,
            sourceType: input.sourceType,
            sourceId: input.sourceId ?? null,
            existingEntitlementCount: conflictingItems.length,
          },
        });

        return {
          plan,
          app,
          entitlement: conflictingItems[0],
          granted: false as const,
          reason: 'already_owned' as const,
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
        deploymentPolicy,
        domainBinding: {
          mode: deploymentPolicy.domainBindingMode,
          sourceField: deploymentPolicy.domainBindingSource,
          scope: deploymentPolicy.domainBindingScope,
          boundValue: null,
          boundAt: null,
        },
        planCode: plan.code,
        appCode: app.code,
      },
    });

    await this.capabilities.createEventService(this.db).capture({
      userId: input.userId,
      appId: app.id,
      eventName: 'license.entitlements_granted',
      properties: {
        planId: plan.id,
        planCode: plan.code,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
      },
    });

    return {
      plan,
      app,
      entitlement,
      granted: true as const,
      reason: 'granted' as const,
    };
  }

  async listUserEntitlements(userId: string) {
    const repository = new LicenseRepository(this.db);
    const items = await repository.listEntitlementsByUserId(userId);
    const now = this.capabilities.now();

    const planIds = [...new Set(items.map((item) => item.planId))];
    const appIds = [...new Set(items.map((item) => item.appId))];
    const plans = await repository.listPlansByIds(planIds);
    const apps = await createAppAccess(this.db).listAppsByIds(appIds);

    // Derive feature codes from plan_features for each entitlement
    const planFeatureMappings = new Map<string, string[]>();
    for (const plan of plans) {
      const mappings = await repository.listPlanFeatureMappingsByPlanId(plan.id);
      const featureIds = mappings.map((m) => m.featureId);
      if (featureIds.length > 0) {
        const features = await repository.listFeaturesByIds(featureIds);
        planFeatureMappings.set(
          plan.id,
          features.map((f) => f.code),
        );
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
        featureCodes,
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
        featureCodes: Array.from(featureCodes).sort(),
      })),
    };
  }

  async listUserEntitlementsByAppId(appId: string, userId: string) {
    const repository = new LicenseRepository(this.db);
    const items = await repository.listEffectiveEntitlementsByUserIdAndAppId(userId, appId);
    const app = await createAppAccess(this.db).findAppById(appId);

    const planIds = [...new Set(items.map((item) => item.planId))];
    const plans = await repository.listPlansByIds(planIds);

    const planFeatureMappings = new Map<string, string[]>();
    for (const plan of plans) {
      const mappings = await repository.listPlanFeatureMappingsByPlanId(plan.id);
      const featureIds = mappings.map((m) => m.featureId);
      if (featureIds.length > 0) {
        const features = await repository.listFeaturesByIds(featureIds);
        planFeatureMappings.set(
          plan.id,
          features.map((f) => f.code),
        );
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
      summary:
        allFeatureCodes.size > 0
          ? [
              {
                appCode,
                featureCodes: Array.from(allFeatureCodes).sort(),
              },
            ]
          : [],
    };
  }
}
