import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { appProducts, apps, authorizationTemplates, prices, products } from '../db/schema';
import { loadEnv } from '../lib/env';

async function main() {
  const env = loadEnv();
  const pool = new Pool({
    connectionString: env.DATABASE_URL
  });
  const db = drizzle(pool);

  try {
    const [product] = await db
      .insert(products)
      .values({
        code: 'ai_web_translator',
        name: 'AI Web Translator',
        tagline: '浏览器内的智能翻译与发布工作台',
        description: '把浏览、翻译、校对和发布流程商品化后的示例产品。',
        deliveryMode: 'direct_access',
        status: 'active',
        meta: {
          productType: 'chrome_extension',
          seededBy: 'seed-mvp'
        }
      })
      .onConflictDoUpdate({
        target: products.code,
        set: {
          name: 'AI Web Translator',
          tagline: '浏览器内的智能翻译与发布工作台',
          description: '把浏览、翻译、校对和发布流程商品化后的示例产品。',
          deliveryMode: 'direct_access',
          status: 'active',
          meta: {
            productType: 'chrome_extension',
            seededBy: 'seed-mvp'
          }
        }
      })
      .returning();

    const seededTemplates = await Promise.all(
      [
        {
          code: 'translator_free',
          name: 'Translator Free',
          description: '免费试用档位'
        },
        {
          code: 'translator_pro',
          name: 'Translator Pro',
          description: '专业版授权档位'
        }
      ].map((item) =>
        db
          .insert(authorizationTemplates)
          .values({
            productId: product.id,
            code: item.code,
            name: item.name,
            description: item.description,
            status: 'active',
            meta: {
              kind: 'tier',
              seededBy: 'seed-mvp'
            }
          })
          .onConflictDoUpdate({
            target: authorizationTemplates.code,
            set: {
              productId: product.id,
              name: item.name,
              description: item.description,
              status: 'active',
              meta: {
                kind: 'tier',
                seededBy: 'seed-mvp'
              }
            }
          })
          .returning()
          .then(([template]) => template)
      )
    );

    const proTemplate = seededTemplates.find((item) => item.code === 'translator_pro');
    if (!proTemplate) {
      throw new Error('translator_pro authorization template was not created');
    }

    const seededPrices = await Promise.all(
      [
        {
          code: 'translator_pro_monthly',
          name: 'Translator Pro Monthly',
          amount: 1990,
          billingType: 'recurring' as const,
          billingInterval: 'month' as const,
          grantStrategy: 'subscription_period' as const
        },
        {
          code: 'translator_pro_yearly',
          name: 'Translator Pro Yearly',
          amount: 19900,
          billingType: 'recurring' as const,
          billingInterval: 'year' as const,
          grantStrategy: 'subscription_period' as const
        }
      ].map((item) =>
        db
          .insert(prices)
          .values({
            productId: product.id,
            authorizationTemplateId: proTemplate.id,
            code: item.code,
            name: item.name,
            billingProvider: 'self_hosted',
            billingPriceId: null,
            billingType: item.billingType,
            billingInterval: item.billingInterval,
            amount: item.amount,
            currency: 'CNY',
            grantStrategy: item.grantStrategy,
            status: 'active',
            meta: {
              seededBy: 'seed-mvp'
            }
          })
          .onConflictDoUpdate({
            target: prices.code,
            set: {
              productId: product.id,
              authorizationTemplateId: proTemplate.id,
              name: item.name,
              billingType: item.billingType,
              billingInterval: item.billingInterval,
              amount: item.amount,
              currency: 'CNY',
              grantStrategy: item.grantStrategy,
              status: 'active',
              meta: {
                seededBy: 'seed-mvp'
              }
            }
          })
          .returning()
          .then(([price]) => price)
      )
    );

    const [seededApp] = await db
      .insert(apps)
      .values({
        code: 'ai_web_translator_ext',
        name: 'AI Web Translator Extension',
        description: 'Chrome extension client for AI Web Translator',
        type: 'chrome_extension',
        status: 'active',
        meta: {
          seededBy: 'seed-mvp'
        }
      })
      .onConflictDoUpdate({
        target: apps.code,
        set: {
          name: 'AI Web Translator Extension',
          description: 'Chrome extension client for AI Web Translator',
          type: 'chrome_extension',
          status: 'active',
          meta: {
            seededBy: 'seed-mvp'
          }
        }
      })
      .returning();

    await db
      .insert(appProducts)
      .values({
        appId: seededApp.id,
        productId: product.id
      })
      .onConflictDoNothing();

    console.log(
      JSON.stringify(
        {
          ok: true,
          product: product.code,
          app: seededApp.code,
          prices: seededPrices.map((price) => price.code),
          authorizationTemplates: seededTemplates.map((template) => template.code)
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
