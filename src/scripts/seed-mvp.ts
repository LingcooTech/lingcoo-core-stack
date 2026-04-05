import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { loadEnv } from '../lib/env';
import { appOffers, apps, features, planFeatures, plans } from '../db/schema';

async function main() {
  const env = loadEnv();
  const pool = new Pool({
    connectionString: env.DATABASE_URL
  });
  const db = drizzle(pool);

  try {
    // Create app directly (no separate product)
    const [seededApp] = await db
      .insert(apps)
      .values({
        code: 'ai_web_translator_ext',
        name: 'AI Web Translator Extension',
        description: 'Chrome extension client for AI Web Translator',
        type: 'chrome_extension',
        status: 'active',
        meta: { seededBy: 'seed-mvp' }
      })
      .onConflictDoUpdate({
        target: apps.code,
        set: {
          name: 'AI Web Translator Extension',
          description: 'Chrome extension client for AI Web Translator',
          type: 'chrome_extension',
          status: 'active',
          meta: { seededBy: 'seed-mvp' }
        }
      })
      .returning();

    // Create features under the app
    const seededFeatures = await Promise.all(
      [
        { code: 'full_context_translation', name: 'Full Context Translation' },
        { code: 'advanced_proofreading', name: 'Advanced Proofreading' },
        { code: 'wordpress_publish', name: 'WordPress Publish' },
        { code: 'notion_publish', name: 'Notion Publish' }
      ].map((item) =>
        db
          .insert(features)
          .values({
            appId: seededApp.id,
            code: item.code,
            name: item.name,
            kind: 'boolean',
            status: 'active'
          })
          .onConflictDoUpdate({
            target: features.code,
            set: { name: item.name, status: 'active' }
          })
          .returning()
          .then(([feature]) => feature)
      )
    );

    // Create plans under the app
    const seededPlans = await Promise.all(
      [
        { code: 'translator_pro_monthly', name: 'Translator Pro Monthly', priceAmount: 1990, interval: 'month' as const },
        { code: 'translator_pro_yearly', name: 'Translator Pro Yearly', priceAmount: 19900, interval: 'year' as const }
      ].map((item) =>
        db
          .insert(plans)
          .values({
            appId: seededApp.id,
            code: item.code,
            name: item.name,
            billingProvider: 'self_hosted',
            billingPriceId: null,
            priceAmount: item.priceAmount,
            currency: 'CNY',
            interval: item.interval,
            meta: { seededBy: 'seed-mvp' },
            status: 'active'
          })
          .onConflictDoUpdate({
            target: plans.code,
            set: {
              name: item.name,
              priceAmount: item.priceAmount,
              currency: 'CNY',
              interval: item.interval,
              status: 'active'
            }
          })
          .returning()
          .then(([plan]) => plan)
      )
    );

    // Create plan-feature mappings
    for (const plan of seededPlans) {
      for (const feature of seededFeatures) {
        await db
          .insert(planFeatures)
          .values({ planId: plan.id, featureId: feature.id, value: { enabled: true } })
          .onConflictDoUpdate({
            target: [planFeatures.planId, planFeatures.featureId],
            set: { value: { enabled: true } }
          });
      }
    }

    // Create app offers
    for (const plan of seededPlans) {
      await db
        .insert(appOffers)
        .values({
          appId: seededApp.id,
          planId: plan.id,
          code: plan.code,
          title: plan.name,
          priceAmount: plan.priceAmount,
          currency: 'CNY',
          isDefault: plan.interval === 'month',
          sortOrder: plan.interval === 'month' ? 0 : 1,
          status: 'active'
        })
        .onConflictDoNothing();
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          app: seededApp.code,
          plans: seededPlans.map((plan) => plan.code),
          features: seededFeatures.map((feature) => feature.code)
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

void main();
