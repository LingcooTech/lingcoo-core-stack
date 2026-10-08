import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { type ProductConfig } from '../lib/app-product';
import { validateAppProduct } from '../lib/app-product-validation';

import * as schema from '../db/schema';
import type { DbClient } from '../db/types';
import { loadEnv } from '../lib/env';
import { DeliverySettingsService } from '../modules/deployment/public';
import { EventService } from '../modules/event/service';
import { AppRepository } from '../modules/app/repository';
import { LicenseRepository } from '../modules/license/repository';
import { AppReadiness } from '../modules/app/readiness';
import { createServiceFactories } from '../composition/service-factories';
import { acquireTransactionLock } from '../db/locks';

type CliOptions = {
  configPath: string;
  actorUserId?: string;
  dryRun: boolean;
  requireSecrets: boolean;
  skipDeliverySettings: boolean;
  readyForSale: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  let configPath = '';
  let actorUserId = process.env.FD_APP_IMPORT_ACTOR_USER_ID?.trim() || undefined;
  let dryRun = false;
  let requireSecrets = false;
  let skipDeliverySettings = false;
  let readyForSale = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--require-secrets') {
      requireSecrets = true;
      continue;
    }
    if (arg === '--skip-delivery-settings') {
      skipDeliverySettings = true;
      continue;
    }
    if (arg === '--ready-for-sale') {
      readyForSale = true;
      requireSecrets = true;
      continue;
    }
    if (arg === '--actor-user-id') {
      const value = argv[index + 1]?.trim();
      if (!value) {
        throw new Error('--actor-user-id requires a value');
      }
      actorUserId = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (configPath) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }
    configPath = arg;
  }

  if (!configPath) {
    throw new Error(
      'Usage: npm run app:import -- app-products/<app-code>/product.json [--actor-user-id <uuid>] [--require-secrets]',
    );
  }

  return {
    configPath,
    actorUserId,
    dryRun,
    requireSecrets,
    skipDeliverySettings,
    readyForSale,
  };
}

async function loadProductConfig(configPath: string) {
  const absolutePath = path.resolve(process.cwd(), configPath);
  const raw = await readFile(absolutePath, 'utf8');
  return {
    absolutePath,
    product: validateAppProduct(JSON.parse(raw)),
  };
}

function buildAppMeta(product: ProductConfig) {
  const meta = {
    ...(product.app.meta ?? {}),
  };

  if (product.delivery?.manifest) {
    meta.deliveryManifest = product.delivery.manifest;
  }
  if (product.delivery?.manifestSource) {
    meta.deliveryManifestSource = product.delivery.manifestSource;
  }

  return meta;
}

function resolveSecrets(
  secretsFromEnv: Record<string, string> | undefined,
  options: Pick<CliOptions, 'requireSecrets'>,
) {
  const secrets: Record<string, string> = {};
  const missing: Array<{ key: string; envName: string }> = [];

  for (const [key, envName] of Object.entries(secretsFromEnv ?? {})) {
    const value = process.env[envName]?.trim();
    if (value) {
      secrets[key] = value;
    } else {
      missing.push({ key, envName });
    }
  }

  if (missing.length > 0 && options.requireSecrets) {
    throw new Error(
      `Missing required secret env vars: ${missing.map((item) => `${item.key}<-${item.envName}`).join(', ')}`,
    );
  }

  return { secrets, missing };
}

async function upsertProduct(db: DbClient, product: ProductConfig) {
  return db.transaction(async (tx) => {
    const appRepository = new AppRepository(tx as DbClient);
    const licenseRepository = new LicenseRepository(tx as DbClient);

    const app = await appRepository.upsertApp({
      code: product.app.code,
      name: product.app.name,
      tagline: product.app.tagline,
      description: product.app.description,
      content: product.app.content,
      iconUrl: product.app.iconUrl,
      coverUrl: product.app.coverUrl,
      screenshots: product.app.screenshots,
      highlights: product.app.highlights,
      faq: product.app.faq,
      links: product.app.links,
      category: product.app.category,
      sortOrder: product.app.sortOrder,
      type: product.app.type,
      status: product.app.status,
      meta: buildAppMeta(product),
    });

    const featureMap = new Map<string, { id: string; code: string }>();
    if (product.features) {
      for (const item of product.features) {
        const feature = await licenseRepository.upsertFeature({
          appId: app.id,
          code: item.code,
          name: item.name,
          kind: item.kind,
          status: item.status,
        });
        featureMap.set(feature.code, feature);
      }

      await licenseRepository.deactivateFeaturesByAppExceptCodes(
        app.id,
        product.features.map((item) => item.code),
      );
    } else if (product.plans) {
      const features = await licenseRepository.listFeaturesByAppId(app.id);
      for (const feature of features) {
        featureMap.set(feature.code, feature);
      }
    }

    if (product.plans) {
      for (const item of product.plans) {
        const plan = await licenseRepository.upsertPlan({
          appId: app.id,
          code: item.code,
          name: item.name,
          billingProvider: item.billingProvider,
          billingPriceId: item.billingPriceId?.trim() || null,
          priceAmount: item.priceAmount,
          currency: item.currency.toUpperCase(),
          interval: item.interval,
          meta: item.meta ?? {},
          status: item.status,
        });

        const featureIds = item.featureCodes
          .map((code) => featureMap.get(code)?.id ?? null)
          .filter((id): id is string => Boolean(id));

        if (featureIds.length !== item.featureCodes.length) {
          const missing = item.featureCodes.filter((code) => !featureMap.has(code));
          throw new Error(`Plan ${item.code} references missing features: ${missing.join(', ')}`);
        }

        await licenseRepository.replacePlanFeatureMappings(plan.id, featureIds);
      }

      await licenseRepository.deactivatePlansByAppExceptCodes(
        app.id,
        product.plans.map((item) => item.code),
      );
    }

    if (product.offers) {
      const plans = await licenseRepository.listPlansByAppId(app.id);
      const planCodeToId = new Map(plans.map((plan) => [plan.code, plan.id]));
      const offers = product.offers.map((offer, index) => {
        const planId = planCodeToId.get(offer.planCode);
        if (!planId) {
          throw new Error(`Offer ${offer.code} references missing plan: ${offer.planCode}`);
        }

        return {
          planId,
          code: offer.code,
          title: offer.title,
          description: offer.description ?? null,
          badge: offer.badge ?? null,
          priceAmount: offer.priceAmount,
          currency: offer.currency.toUpperCase(),
          isDefault: offer.isDefault ?? false,
          sortOrder: offer.sortOrder ?? index,
          status: offer.status,
        };
      });

      await appRepository.replaceAppOffers(app.id, offers);
    }

    await new EventService(tx as DbClient).capture({
      appId: app.id,
      eventName: 'app.product_config_imported',
      properties: {
        appCode: product.app.code,
        schemaVersion: product.schemaVersion,
        plans: product.plans?.map((item) => item.code) ?? [],
        offers: product.offers?.map((item) => item.code) ?? [],
        hasDeliveryManifest: Boolean(product.delivery?.manifest),
        hasDeliverySettings: Boolean(product.delivery?.settings),
      },
    });

    return app;
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.readyForSale && options.skipDeliverySettings)
    throw new Error('--ready-for-sale cannot skip delivery settings');
  const { absolutePath, product } = await loadProductConfig(options.configPath);
  const publishingOneClick =
    product.app.status === 'active' && product.app.meta?.deliveryMode === 'one_click';
  if (options.readyForSale || publishingOneClick) {
    validateAppProduct(product, true);
    options.requireSecrets = true;
  }
  if (publishingOneClick && options.skipDeliverySettings)
    throw new Error('Publishing cannot skip delivery settings');
  const { secrets, missing } = resolveSecrets(product.delivery?.settings?.secretsFromEnv, options);
  const shouldApplyDeliverySettings =
    Boolean(product.delivery?.settings) && !options.skipDeliverySettings;

  if (options.dryRun) {
    console.info(
      JSON.stringify(
        {
          mode: 'dry-run',
          configPath: absolutePath,
          app: product.app.code,
          plans: product.plans?.map((item) => item.code) ?? [],
          offers: product.offers?.map((item) => item.code) ?? [],
          deliverySettings: shouldApplyDeliverySettings,
          resolvedSecretKeys: Object.keys(secrets),
          missingSecretEnv: missing,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (shouldApplyDeliverySettings && !options.actorUserId) {
    throw new Error(
      'Delivery settings import requires --actor-user-id <uuid> or FD_APP_IMPORT_ACTOR_USER_ID, because settings rows keep updated_by_user_id.',
    );
  }

  const env = loadEnv();
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
  });
  const db = drizzle(pool, { schema });

  try {
    // Catalog, plans, offers, encrypted delivery settings and events are one import.
    // A credential/configuration failure must not leave a half-published product.
    await db.transaction(async (tx) => {
      await acquireTransactionLock(tx, 'app:publication:' + product.app.code);
      await upsertProduct(tx as DbClient, product);
      if (shouldApplyDeliverySettings && product.delivery?.settings && options.actorUserId) {
        await new DeliverySettingsService(tx, env).upsertSettings(
          product.app.code,
          {
            values: product.delivery.settings.values ?? {},
            secrets,
            installer: product.delivery.settings.installer,
          },
          options.actorUserId,
        );
      }
      if (publishingOneClick) {
        await new AppReadiness(tx, env, createServiceFactories()).assertConfiguration(
          product.app.code,
        );
      }
    });

    console.info(
      JSON.stringify(
        {
          imported: true,
          app: product.app.code,
          configPath: absolutePath,
          deliverySettingsApplied: shouldApplyDeliverySettings,
          resolvedSecretKeys: Object.keys(secrets),
          missingSecretEnv: missing,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
