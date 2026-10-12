import { AppReadiness } from './readiness';
import { acquireTransactionLock } from '../../db/locks';
import { requireResult } from '../../db/required-result';
import { queryBatch } from '../../db/query-batch';
import { pickAppDependencies, type AppDependencies } from './dependencies';
import { randomBytes } from 'node:crypto';

import type { DbExecutor } from '../../db/types';
import { hasPublicTable } from '../../lib/db-compat';
import { AppManifestService } from './manifest-service';
import { AppLifecycleService } from './lifecycle-service';
import { AppLifecycleRepository } from './lifecycle-repository';
import { applicationReleaseSchema } from '@lingcoo/contracts';
import { compileComposePlan } from './compose-plan';
import { composeManifest } from './delivery-view';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/security';

import { type LicenseRepositoryPort as LicenseRepository } from '../license/public';

import { AppRepository } from './repository';

type AppRecord = NonNullable<Awaited<ReturnType<AppRepository['findAppByCode']>>>;
type PlanRecord = Awaited<ReturnType<LicenseRepository['listPlansByAppIds']>>[number];
type OfferRecord = Awaited<ReturnType<AppRepository['listOffersByAppId']>>[number];
type AppSecretRecord = Awaited<ReturnType<AppRepository['listAppSecretsByAppIds']>>[number];

export type CheckoutOffer = {
  code: string;
  planCode: string;
  planId: string;
  appId: string;
  appCode: string;
  appName: string;
  title: string;
  description: string | null;
  badge: string | null;
  interval: 'month' | 'year' | 'one_time';
  priceAmount: number;
  currency: string;
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
  isDefault: boolean;
  sortOrder: number;
};

export class AppService {
  lifecycle() {
    if (!this.env) throw httpError(503, 'Application runtime settings are unavailable');
    return new AppLifecycleService(
      this.db,
      this.env,
      this.capabilities,
      (db) => new AppService(this.capabilities, db, this.env),
    );
  }
  private readonly capabilities: AppDependencies;
  constructor(
    capabilities: AppDependencies,
    private readonly db: DbExecutor,
    private readonly env?: AppEnv,
  ) {
    this.capabilities = pickAppDependencies(capabilities);
  }

  private isDeletedApp(app: { meta: unknown }) {
    const meta = this.normalizeMeta(app.meta);
    return typeof meta.deletedAt === 'string' && meta.deletedAt.trim().length > 0;
  }

  private isSecretUsable(secret: AppSecretRecord, now = this.capabilities.now()) {
    return (
      secret.status === 'active' &&
      (!secret.expiresAt || secret.expiresAt.getTime() >= now.getTime())
    );
  }

  private createDefaultSecretName(appCode: string) {
    return `${appCode}-secret-${this.capabilities
      .now()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14)}`;
  }

  private buildCheckoutOffersFromDb(
    app: { id: string; code: string; name: string },
    offers: OfferRecord[],
    plans: PlanRecord[],
  ): CheckoutOffer[] {
    const planMap = new Map(plans.map((p) => [p.id, p]));

    if (offers.length > 0) {
      const result = offers
        .filter((o) => planMap.has(o.planId))
        .map((o) => {
          const plan = planMap.get(o.planId)!;
          return {
            code: o.code,
            planCode: plan.code,
            planId: plan.id,
            appId: app.id,
            appCode: app.code,
            appName: app.name,
            title: o.title,
            description: o.description,
            badge: o.badge,
            interval: plan.interval,
            priceAmount: o.priceAmount,
            currency: o.currency,
            status: plan.status === 'active' ? o.status : 'inactive',
            isDefault: o.isDefault,
            sortOrder: o.sortOrder,
          } satisfies CheckoutOffer;
        })
        .sort((a, b) => a.sortOrder - b.sortOrder);

      if (result[0] && !result.some((o) => o.isDefault)) {
        result[0] = { ...result[0], isDefault: true };
      }

      return result;
    }

    // Fallback: generate offers from active plans
    return plans
      .filter((p) => p.status === 'active')
      .sort((a, b) => {
        const w = { month: 0, year: 1, one_time: 2 };
        return w[a.interval] - w[b.interval] || a.code.localeCompare(b.code);
      })
      .map((plan, index) => ({
        code: plan.code,
        planCode: plan.code,
        planId: plan.id,
        appId: app.id,
        appCode: app.code,
        appName: app.name,
        title: plan.name,
        description: null,
        badge: null,
        interval: plan.interval,
        priceAmount: plan.priceAmount,
        currency: plan.currency,
        status: plan.status,
        isDefault: index === 0,
        sortOrder: index,
      }));
  }

  private async hydrateApps(appRecords: AppRecord[], includeSecrets = false) {
    const repository = new AppRepository(this.db);
    const licenseRepository = this.capabilities.createLicenseAccess(this.db);
    const appIds = appRecords.map((app) => app.id);

    const [plans, features, offers] = await queryBatch(this.db, [
      () => licenseRepository.listPlansByAppIds(appIds),
      () => licenseRepository.listFeatures(),
      () => repository.listOffersByAppIds(appIds),
    ]);

    const plansByAppId = new Map<string, PlanRecord[]>();
    for (const plan of plans) {
      if (!plansByAppId.has(plan.appId)) {
        plansByAppId.set(plan.appId, []);
      }
      plansByAppId.get(plan.appId)?.push(plan);
    }

    const featuresByAppId = new Map<string, typeof features>();
    for (const feature of features) {
      if (!featuresByAppId.has(feature.appId)) {
        featuresByAppId.set(feature.appId, []);
      }
      featuresByAppId.get(feature.appId)?.push(feature);
    }

    const offersByAppId = new Map<string, OfferRecord[]>();
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
      const appPlans = plansByAppId.get(app.id) ?? [];
      const appFeatures = featuresByAppId.get(app.id) ?? [];
      const appOffers = offersByAppId.get(app.id) ?? [];

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
        plans: appPlans.map((plan) => ({
          id: plan.id,
          appId: plan.appId,
          code: plan.code,
          name: plan.name,
          interval: plan.interval,
          priceAmount: plan.priceAmount,
          currency: plan.currency,
          status: plan.status,
          meta: plan.meta,
        })),
        features: appFeatures.map((f) => ({
          id: f.id,
          appId: f.appId,
          code: f.code,
          name: f.name,
          kind: f.kind,
          status: f.status,
        })),
        checkoutOffers: this.buildCheckoutOffersFromDb(app, appOffers, appPlans),
        secrets: includeSecrets
          ? (secretsByAppId.get(app.id) ?? []).map((secret) => ({
              id: secret.id,
              name: secret.name,
              hint: secret.hint,
              status: secret.status,
              lastUsedAt: secret.lastUsedAt,
              expiresAt: secret.expiresAt,
              createdAt: secret.createdAt,
            }))
          : undefined,
      };
    });
  }

  async listActiveApps() {
    const apps = await new AppRepository(this.db).listApps();
    return this.hydrateApps(apps.filter((app) => app.status === 'active'));
  }

  async listManagedApps() {
    const apps = await new AppRepository(this.db).listApps();
    return this.hydrateApps(
      apps.filter((app) => !this.isDeletedApp(app)),
      true,
    );
  }

  async getPublicApp(appCode: string) {
    const app = await new AppRepository(this.db).findAppByCode(appCode);
    if (!app || app.status !== 'active') {
      throw httpError(404, 'App not found or inactive');
    }

    const [hydrated] = await this.hydrateApps([app]);
    const result = requireResult(hydrated, 'app projection');
    const meta = this.normalizeMeta(result.meta);
    if (meta.deliveryProtocol === 'compose_v2' && this.env) {
      const row = await new AppLifecycleRepository(this.db).currentPublishedRelease(app.id);
      if (
        row &&
        (row.definition as { delivery?: { kind?: string } }).delivery?.kind === 'compose'
      ) {
        const release = applicationReleaseSchema.parse({
          ...row,
          createdAt: row.createdAt.toISOString(),
          publishedAt: row.publishedAt?.toISOString() ?? null,
        });
        const mode =
          release.definition.delivery.kind === 'compose'
            ? release.definition.delivery.modes[0]!
            : 'managed';
        const plan = compileComposePlan(release, { instanceId: release.id, mode });
        const manifest = composeManifest(plan, this.env.PUBLIC_BASE_URL);
        return {
          ...result,
          meta: {
            ...meta,
            deliveryReleaseId: release.id,
            deliveryManifest: manifest,
            hostingProfile: {
              enabled:
                release.definition.delivery.kind === 'compose' &&
                release.definition.delivery.modes.includes('managed'),
              domainField: manifest.domainSlots[0]!.sourceField,
              resources: {
                cpuMillis: plan.resources.cpuMillis,
                memoryMb: plan.resources.memoryMb,
                diskMb: Math.max(1024, plan.resources.diskMb),
              },
            },
          },
        };
      }
    }
    return result;
  }

  async getManagedApp(appCode: string) {
    const app = await new AppRepository(this.db).findAppByCode(appCode);
    if (!app) {
      throw httpError(404, 'App not found');
    }

    const [hydrated] = await this.hydrateApps([app], true);
    return requireResult(hydrated, 'app projection');
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
      (secret) => this.isSecretUsable(secret) && verifyPassword(plainSecret, secret.secretHash),
    );

    if (!matched) {
      throw httpError(401, 'Invalid app secret');
    }

    const touched = await new AppRepository(this.db).markAppSecretUsed(matched.id);
    const secret = touched ?? matched;

    await this.capabilities.createEventService(this.db).capture({
      eventName: 'app.session_authenticated',
      properties: {
        appCode: app.code,
        secretId: secret.id,
        hint: secret.hint,
      },
    });

    return { app, secret };
  }

  async requireActiveSecretById(appCode: string, secretId: string) {
    const app = await this.requireActiveApp(appCode);
    const secret = await new AppRepository(this.db).findAppSecretById(secretId);

    if (!secret || secret.appId !== app.id || !this.isSecretUsable(secret)) {
      throw httpError(401, 'Invalid or expired app token');
    }

    return { app, secret };
  }

  async getAppCatalog(appCode: string) {
    const app = await this.getPublicApp(appCode);
    const licenseRepository = this.capabilities.createLicenseAccess(this.db);
    const appRepository = new AppRepository(this.db);

    const [plans, appFeatures, offers, planFeatures] = await queryBatch(this.db, [
      () => licenseRepository.listPlansByAppId(app.id),
      () => licenseRepository.listFeaturesByAppId(app.id),
      () => appRepository.listOffersByAppId(app.id),
      () => licenseRepository.listPlanFeatureMappings(),
    ]);

    const planIds = new Set(plans.map((p) => p.id));
    const featureIds = new Set(appFeatures.map((f) => f.id));
    const checkoutOffers = this.buildCheckoutOffersFromDb(app, offers, plans);

    return {
      app,
      plans,
      offers: checkoutOffers,
      features: appFeatures,
      planFeatures: planFeatures.filter(
        (m) => planIds.has(m.planId) && featureIds.has(m.featureId),
      ),
    };
  }

  async resolveCheckoutOffer(appCode: string, input: { planCode?: string; offerCode?: string }) {
    const catalog = await this.getAppCatalog(appCode);
    const activeOffers = catalog.offers.filter((o) => o.status === 'active');

    if (activeOffers.length === 0) {
      throw httpError(422, 'No active checkout offers are configured for this app');
    }

    let offer: CheckoutOffer | null =
      (input.offerCode ? activeOffers.find((o) => o.code === input.offerCode) : null) ?? null;

    if (input.offerCode && !offer) {
      throw httpError(404, `Checkout offer not found: ${input.offerCode}`);
    }

    if (!offer && input.planCode) {
      const matched = activeOffers.filter((o) => o.planCode === input.planCode);
      if (matched.length === 1) {
        offer = matched[0] ?? null;
      } else if (matched.length > 1) {
        offer = matched.find((o) => o.isDefault) ?? matched[0] ?? null;
      } else {
        throw httpError(404, `Checkout plan is not available for this app: ${input.planCode}`);
      }
    }

    if (!offer) {
      offer = activeOffers.find((o) => o.isDefault) ?? activeOffers[0] ?? null;
    }

    if (!offer) {
      throw httpError(404, 'Checkout offer not found');
    }

    const plan = catalog.plans.find((p) => p.id === offer!.planId);
    if (!plan) {
      throw httpError(500, 'Checkout offer is missing related plan');
    }

    if (plan.status !== 'active') {
      throw httpError(422, `Checkout plan is not available for this app: ${plan.code}`);
    }

    return {
      app: catalog.app,
      plan,
      offer,
    };
  }

  async listUserEntitlementsForApp(appCode: string, userId: string) {
    const app = await this.getPublicApp(appCode);
    const entitlements = await this.capabilities
      .createLicenseService(this.db)
      .listUserEntitlementsByAppId(app.id, userId);

    return {
      app,
      items: entitlements.items,
      summary: entitlements.summary,
    };
  }

  async releaseReadiness(appCode: string) {
    return new AppReadiness(this.db, this.env, this.capabilities).inspect(appCode);
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
      type: string;
      status: 'active' | 'inactive' | 'cancelled' | 'expired';
      features?: Array<{
        code: string;
        name: string;
        kind: string;
        status: 'active' | 'inactive' | 'cancelled' | 'expired';
      }>;
      plans?: Array<{
        code: string;
        name: string;
        billingProvider: string;
        billingPriceId?: string;
        priceAmount: number;
        currency: string;
        interval: 'month' | 'year' | 'one_time';
        status: 'active' | 'inactive' | 'cancelled' | 'expired';
        featureCodes: string[];
        meta?: Record<string, unknown>;
      }>;
      offers?: Array<{
        code: string;
        planCode: string;
        title: string;
        description?: string;
        badge?: string;
        priceAmount: number;
        currency: string;
        isDefault?: boolean;
        sortOrder?: number;
        status: 'active' | 'inactive' | 'cancelled' | 'expired';
      }>;
      meta?: Record<string, unknown>;
    },
    actorUserId: string,
  ) {
    await this.db.transaction(async (tx) => {
      await acquireTransactionLock(tx, 'app:publication:' + appCode);
      const repository = new AppRepository(tx);
      const previous = await repository.findAppByCode(appCode);
      const licenseRepository = this.capabilities.createLicenseAccess(tx);

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
        meta: this.buildEditableMeta(input.meta, input.status),
      });

      const featureMap = new Map<string, { id: string; code: string }>();

      if (input.features !== undefined) {
        for (const f of input.features) {
          const feature = await licenseRepository.upsertFeature({
            appId: app.id,
            code: f.code.trim(),
            name: f.name.trim(),
            kind: f.kind.trim() || 'boolean',
            status: f.status,
          });
          featureMap.set(feature.code, feature);
        }

        await licenseRepository.deactivateFeaturesByAppExceptCodes(
          app.id,
          input.features.map((f) => f.code.trim()).filter(Boolean),
        );
      } else if (input.plans !== undefined) {
        const existingFeatures = await licenseRepository.listFeaturesByAppId(app.id);
        for (const feature of existingFeatures) {
          featureMap.set(feature.code, feature);
        }
      }

      if (input.plans !== undefined) {
        for (const p of input.plans) {
          const plan = await licenseRepository.upsertPlan({
            appId: app.id,
            code: p.code.trim(),
            name: p.name.trim(),
            billingProvider: p.billingProvider.trim() || 'self_hosted',
            billingPriceId: p.billingPriceId?.trim() || null,
            priceAmount: p.priceAmount,
            currency: p.currency.trim().toUpperCase() || 'CNY',
            interval: p.interval,
            meta: p.meta ?? {},
            status: p.status,
          });

          const featureIds = p.featureCodes
            .map((code) => featureMap.get(code.trim())?.id ?? null)
            .filter((id): id is string => Boolean(id));

          await licenseRepository.replacePlanFeatureMappings(plan.id, featureIds);
        }

        await licenseRepository.deactivatePlansByAppExceptCodes(
          app.id,
          input.plans.map((p) => p.code.trim()).filter(Boolean),
        );
      }

      // Replace offers
      if (input.offers) {
        const allPlans = await licenseRepository.listPlansByAppId(app.id);
        const planCodeToId = new Map(allPlans.map((p) => [p.code, p.id]));

        const validOffers = input.offers
          .filter((o) => o.code && o.planCode && o.title && planCodeToId.has(o.planCode))
          .map((o, index) => ({
            planId: planCodeToId.get(o.planCode)!,
            code: o.code.trim(),
            title: o.title.trim(),
            description: o.description?.trim() || null,
            badge: o.badge?.trim() || null,
            priceAmount: o.priceAmount,
            currency: o.currency.trim().toUpperCase() || 'CNY',
            isDefault: o.isDefault ?? false,
            sortOrder: o.sortOrder ?? index,
            status: o.status,
          }));

        await repository.replaceAppOffers(app.id, validOffers);
      }

      if (
        input.status === 'active' &&
        (previous?.status !== 'active' ||
          (previous.meta as Record<string, unknown>)?.deliveryMode !== 'one_click') &&
        (app.meta as Record<string, unknown>)?.deliveryMode === 'one_click'
      )
        await new AppReadiness(tx, this.env, this.capabilities).assertConfiguration(appCode);

      await this.capabilities.createEventService(tx).capture({
        userId: actorUserId,
        appId: app.id,
        eventName: 'app.upserted',
        properties: {
          appCode,
          status: input.status,
          type: input.type,
        },
      });
    });

    return this.getManagedApp(appCode);
  }

  async archiveApp(appCode: string, actorUserId: string) {
    const repository = new AppRepository(this.db);
    const app = await repository.findAppByCode(appCode);
    if (!app) {
      throw httpError(404, 'App not found');
    }

    await repository.updateAppById(app.id, {
      status: 'inactive',
      meta: this.buildArchivedMeta(app.meta),
    });

    await this.capabilities.createEventService(this.db).capture({
      userId: actorUserId,
      appId: app.id,
      eventName: 'app.archived',
      properties: {
        appCode: app.code,
        previousStatus: app.status,
      },
    });

    return this.getManagedApp(appCode);
  }

  async purgeAppConfiguration(appCode: string, confirmAppCode: string, actorUserId: string) {
    if (confirmAppCode.trim() !== appCode) {
      throw httpError(422, 'Confirmation app code does not match');
    }

    const hasAppDeliverySettingsTable = await hasPublicTable(this.db, 'app_delivery_settings');

    await this.db.transaction(async (tx) => {
      const repository = new AppRepository(tx);
      const licenseRepository = this.capabilities.createLicenseAccess(tx);
      const app = await repository.findAppByCode(appCode);

      if (!app) {
        throw httpError(404, 'App not found');
      }

      await repository.deleteAppOffersByAppId(app.id);
      await repository.deleteAppSecretsByAppId(app.id);
      await licenseRepository.deleteFeaturesByAppId(app.id);
      await licenseRepository.deactivatePlansByAppId(app.id);
      if (hasAppDeliverySettingsTable) {
        await this.capabilities.deleteAppDeliverySettings(tx, app.id);
      }
      await repository.updateAppById(app.id, {
        tagline: null,
        description: null,
        content: null,
        iconUrl: null,
        coverUrl: null,
        screenshots: [],
        highlights: [],
        faq: [],
        links: [],
        category: null,
        sortOrder: 0,
        status: 'inactive',
        meta: this.buildPurgedMeta(app.meta),
      });

      await this.capabilities.createEventService(tx).capture({
        userId: actorUserId,
        appId: app.id,
        eventName: 'app.configuration_purged',
        properties: {
          appCode: app.code,
          previousStatus: app.status,
        },
      });
    });

    return this.getManagedApp(appCode);
  }

  async issueSecret(
    appCode: string,
    input: { name?: string; expiresAt?: string },
    actorUserId: string,
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
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });

    await this.capabilities.createEventService(this.db).capture({
      userId: actorUserId,
      eventName: 'app.secret_issued',
      properties: { appCode: app.code, secretId: secret.id, hint: secret.hint },
    });

    return {
      appCode: app.code,
      appName: app.name,
      secretId: secret.id,
      secret: plainSecret,
      hint: secret.hint,
      expiresAt: secret.expiresAt,
      createdAt: secret.createdAt,
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

    const updated =
      secret.status === 'cancelled'
        ? secret
        : await repository.updateAppSecretStatus(secret.id, 'cancelled');

    if (!updated) {
      throw httpError(500, 'Failed to revoke app secret');
    }

    await this.capabilities.createEventService(this.db).capture({
      userId: actorUserId,
      eventName: 'app.secret_revoked',
      properties: {
        appCode: app.code,
        secretId: updated.id,
        hint: updated.hint,
        previousStatus: secret.status,
      },
    });

    return {
      appCode: app.code,
      appName: app.name,
      secretId: updated.id,
      hint: updated.hint,
      status: updated.status,
      expiresAt: updated.expiresAt,
      lastUsedAt: updated.lastUsedAt,
    };
  }

  private normalizeMeta(meta: unknown) {
    return meta && typeof meta === 'object' && !Array.isArray(meta)
      ? { ...(meta as Record<string, unknown>) }
      : {};
  }

  private buildArchivedMeta(meta: unknown, archivedAt = this.capabilities.now().toISOString()) {
    const nextMeta = this.normalizeMeta(meta);

    if (typeof nextMeta.archivedAt !== 'string' || !nextMeta.archivedAt.trim()) {
      nextMeta.archivedAt = archivedAt;
    }

    return nextMeta;
  }

  private buildPurgedMeta(meta: unknown, deletedAt = this.capabilities.now().toISOString()) {
    const nextMeta = this.buildArchivedMeta(meta, deletedAt);

    delete nextMeta.deliveryManifest;
    delete nextMeta.deliveryManifestSource;
    nextMeta.deliveryMode = 'none';
    nextMeta.deletedAt = deletedAt;
    nextMeta.deletionMode = 'config_purged';

    return nextMeta;
  }

  private buildEditableMeta(
    meta: unknown,
    status: 'active' | 'inactive' | 'cancelled' | 'expired',
  ) {
    const nextMeta = this.normalizeMeta(meta);

    if (status === 'active') {
      delete nextMeta.archivedAt;
      delete nextMeta.deletedAt;
      delete nextMeta.deletionMode;
    }

    return nextMeta;
  }

  async syncDeliveryManifest(
    appCode: string,
    input: { repoUrl?: string; repoBranch?: string; manifestPath?: string; manifestUrl?: string },
    actorUserId: string,
  ) {
    await new AppManifestService(this.capabilities, this.db, this.env).sync(
      appCode,
      input,
      actorUserId,
    );
    return this.getManagedApp(appCode);
  }
}
