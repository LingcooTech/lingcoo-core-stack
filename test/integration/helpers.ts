import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../src/db/schema';
import { loadEnv } from '../../src/lib/env';

export function testDatabase() {
  const url = process.env.DATABASE_TEST_URL;
  assert(
    url && new URL(url).pathname.endsWith('_test'),
    'Only an explicit disposable test database is allowed',
  );
  const pool = new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 5000 });
  return { pool, db: drizzle(pool, { schema }), env: loadEnv() };
}
export async function seedPurchase(db: ReturnType<typeof testDatabase>['db']) {
  const code = `test_${randomUUID().replaceAll('-', '')}`;
  const [user] = await db
    .insert(schema.users)
    .values({ email: `${code}@example.test`, emailVerified: true })
    .returning();
  if (!user) throw new Error('Missing test fixture: user');
  const [app] = await db
    .insert(schema.apps)
    .values({
      code,
      name: 'Integration fixture',
      meta: {
        deliveryMode: 'one_click',
        deliveryManifest: {
          version: '1',
          installer: {
            repoUrl: 'https://example.test/fixture',
            repoBranch: 'main',
            remoteInstallScriptUrl: 'https://example.test/install.sh',
            remoteInstallScriptSha256: 'a'.repeat(64),
            installPath: '/opt/fixture',
          },
          groups: [],
          domainSlots: [],
          envFields: [],
          secretFields: [],
          assets: [],
        },
      },
    })
    .returning();
  if (!app) throw new Error('Missing test fixture: app');
  const [plan] = await db
    .insert(schema.plans)
    .values({
      appId: app.id,
      code,
      name: 'Test plan',
      billingProvider: 'wechat_pay',
      interval: 'one_time',
      priceAmount: 100,
    })
    .returning();
  if (!plan) throw new Error('Missing test fixture: plan');
  const [feature] = await db
    .insert(schema.features)
    .values({ appId: app.id, code, name: 'Test feature' })
    .returning();
  if (!feature) throw new Error('Missing test fixture: feature');
  await db
    .insert(schema.planFeatures)
    .values({ planId: plan.id, featureId: feature.id, value: { enabled: true } });
  const [order] = await db
    .insert(schema.orders)
    .values({
      userId: user.id,
      appId: app.id,
      planId: plan.id,
      orderNo: code,
      provider: 'wechat_pay',
      subject: 'Fixture',
      amount: 100,
      currency: 'CNY',
    })
    .returning();
  if (!order) throw new Error('Missing test fixture: order');
  return { user, app, plan, order };
}
