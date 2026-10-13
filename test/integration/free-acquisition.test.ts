import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  apps,
  plans,
  users,
  entitlements,
  orders,
  events,
  hostingOffers,
} from '../../src/db/schema';
import { seedPurchase, testDatabase } from './helpers';
import { createServiceFactories } from '../../src/composition/service-factories';
import { AppService } from '../../src/modules/app/service';
import { LicenseService } from '../../src/modules/license/service';
import { LicenseRepository } from '../../src/modules/license/repository';
import { HostingCheckoutSelection } from '../../src/modules/billing/hosting-checkout';
import { HostingServiceTerms } from '../../src/modules/deployment/hosting-service';
import { buildApp } from '../../src/app';
const { db, pool, env } = testDatabase();
after(() => pool.end());
const factories = createServiceFactories();
const license = new LicenseService(factories, db);
async function fixture() {
  const { user } = await seedPurchase(db);
  const code = 'free_' + randomUUID().replaceAll('-', '');
  const input = {
    name: 'Free application',
    type: 'web_app',
    status: 'active' as const,
    meta: { acquisition: 'free', deliveryMode: 'none' },
    features: [
      { code: code + '_access', name: 'Access', kind: 'boolean', status: 'active' as const },
    ],
    plans: [
      {
        code,
        name: 'Free',
        billingProvider: 'free',
        interval: 'one_time' as const,
        status: 'active' as const,
        priceAmount: 0,
        currency: 'CNY',
        featureCodes: [code + '_access'],
      },
    ],
    offers: [],
  };
  const service = new AppService(factories, db, env);
  const app = await service.upsertApp(code, input, user.id);
  return { user, code, input, app, service };
}
test('concurrent free claims grant once, isolate users, audit once, create no payment order and preserve revocation', async () => {
  const f = await fixture();
  const results = await Promise.all(
    Array.from({ length: 6 }, () => license.claimFreeApplication(f.code, f.user.id)),
  );
  assert.equal(new Set(results.map((r) => r.entitlementId)).size, 1);
  assert.equal(results.filter((r) => !r.alreadyOwned).length, 1);
  const [item] = await db
    .select()
    .from(entitlements)
    .where(eq(entitlements.id, results[0]!.entitlementId));
  assert.equal(item!.sourceType, 'grant');
  assert.equal(item!.expiresAt, null);
  assert.equal((await db.select().from(orders).where(eq(orders.appId, f.app.id))).length, 0);
  assert.equal(
    (
      await db
        .select()
        .from(events)
        .where(and(eq(events.appId, f.app.id), eq(events.eventName, 'app.free_claimed')))
    ).length,
    1,
  );
  const [other] = await db
    .insert(users)
    .values({ email: randomUUID() + '@example.test' })
    .returning();
  const another = await license.claimFreeApplication(f.code, other!.id);
  assert.notEqual(another.entitlementId, item!.id);
  await new LicenseRepository(db).cancelEntitlementById(item!.id);
  await assert.rejects(license.claimFreeApplication(f.code, f.user.id), { statusCode: 409 });
  assert.equal(
    (await db.select().from(entitlements).where(eq(entitlements.sourceId, item!.sourceId!))).length,
    1,
  );
});
test('free claim rejects paid, unpublished and ambiguous plans; active invalid edits roll back', async () => {
  const paid = await seedPurchase(db);
  await assert.rejects(license.claimFreeApplication(paid.app.code, paid.user.id), {
    statusCode: 422,
  });
  const f = await fixture();
  await assert.rejects(
    f.service.upsertApp(
      f.code,
      { ...f.input, plans: f.input.plans.map((p) => ({ ...p, priceAmount: 100 })) },
      f.user.id,
    ),
    { statusCode: 422 },
  );
  await db.update(apps).set({ status: 'inactive' }).where(eq(apps.id, f.app.id));
  await assert.rejects(license.claimFreeApplication(f.code, f.user.id), { statusCode: 404 });
  await db.update(apps).set({ status: 'active' }).where(eq(apps.id, f.app.id));
  await db.insert(plans).values({
    appId: f.app.id,
    code: f.code + '_duplicate',
    name: 'Ambiguous',
    billingProvider: 'free',
    interval: 'one_time',
    priceAmount: 0,
  });
  await assert.rejects(license.claimFreeApplication(f.code, f.user.id), { statusCode: 422 });
});
test('free claim HTTP requires login and rejects caller-supplied identity or plan', async () => {
  const f = await fixture(),
    api = await buildApp(env);
  try {
    const url = '/v1/apps/' + f.code + '/claim';
    assert.equal((await api.inject({ method: 'POST', url, payload: {} })).statusCode, 401);
    const headers = { authorization: 'Bearer ' + api.jwt.sign({ sub: f.user.id, kind: 'user' }) };
    assert.equal(
      (await api.inject({ method: 'POST', url, headers, payload: { userId: randomUUID() } }))
        .statusCode,
      400,
    );
    const result = await api.inject({ method: 'POST', url, headers, payload: {} });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.json().alreadyOwned, false);
    const repeated = await api.inject({ method: 'POST', url, headers, payload: {} });
    assert.equal(repeated.statusCode, 200, repeated.body);
    assert.equal(repeated.json().entitlementId, result.json().entitlementId);
    assert.equal(repeated.json().alreadyOwned, true);
  } finally {
    await api.close();
  }
});
test('claimed free rights can select separately paid hosting without a software offer', async () => {
  const f = await fixture(),
    claim = await license.claimFreeApplication(f.code, f.user.id);
  const [offer] = await db
    .insert(hostingOffers)
    .values({
      appId: f.app.id,
      code: 'monthly',
      id: randomUUID(),
      description: 'Separate hosting',
      graceDays: 7,
      retentionDays: 30,
      title: 'Hosting',
      interval: 'month',
      priceAmount: 1990,
      status: 'active',
    })
    .returning();
  await db
    .update(apps)
    .set({
      meta: {
        acquisition: 'free',
        deliveryMode: 'one_click',
        hostingProfile: {
          enabled: true,
          domainField: 'primaryDomain',
          resources: { cpuMillis: 500, memoryMb: 256, diskMb: 1024 },
        },
      },
    })
    .where(eq(apps.id, f.app.id));
  const selection = await new HostingCheckoutSelection(
    db,
    (executor, clock) => new HostingServiceTerms(executor, clock),
  ).resolve({
    userId: f.user.id,
    appCode: f.code,
    planCode: f.code,
    hosting: { offerId: offer!.id, version: offer!.version },
    hostingOnly: { entitlementId: claim.entitlementId },
  });
  assert.equal(selection.plan.priceAmount, 0);
  assert.equal(selection.offer.priceAmount, 1990);
  assert.deepEqual(selection.target, { kind: 'new', entitlementId: claim.entitlementId });
});

test('source-defined free products get default rights, require published delivery and reject withdrawn releases', async () => {
  const { user } = await seedPurchase(db);
  const service = new AppService(factories, db, env),
    lifecycle = service.lifecycle();
  for (let i = 0; i < 2; i++) {
    const code = 'source_free_' + randomUUID().replaceAll('-', '');
    const preview = await lifecycle.preview({
      document: JSON.stringify({
        schemaVersion: 1,
        app: { code, name: 'Free source', license: 'MIT', acquisition: 'free' },
        features: [],
        delivery: { kind: 'none', url: 'https://example.test/free' },
      }),
    });
    await lifecycle.createProject(preview, user.id);
    await lifecycle.importProjectProduct(code, user.id);
    const input = { name: 'Free source', type: 'web_app', status: 'active' as const };
    await assert.rejects(service.upsertApp(code, input, user.id), { statusCode: 422 });
    const release = await lifecycle.registerRelease(
      code,
      {
        version: '1.0.0',
        commit: 'a'.repeat(40),
        definition: preview.definition,
        images: {},
        notes: '',
      },
      user.id,
    );
    await lifecycle.transition(code, release.id, 'published', user.id);
    await service.selectDeliveryVersion(code, release.id, user.id);
    const app = await service.upsertApp(code, input, user.id);
    const autoPlans = await new LicenseRepository(db).listPlansByAppId(app.id);
    assert.equal(autoPlans.length, 1);
    assert.equal(autoPlans[0]!.priceAmount, 0);
    await license.claimFreeApplication(code, user.id);
    await lifecycle.transition(code, release.id, 'withdrawn', user.id);
    await assert.rejects(license.claimFreeApplication(code, user.id), { statusCode: 422 });
  }
});
