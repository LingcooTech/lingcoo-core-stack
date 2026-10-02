import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { queryBatch } from '../../src/db/query-batch';
import { apps, appDeliverySettings } from '../../src/db/schema';
import { createServiceFactories } from '../../src/composition/service-factories';
import { AppManifestService } from '../../src/modules/app/manifest-service';
import { testDatabase, seedPurchase } from './helpers';
const { db, pool, env } = testDatabase();
after(() => pool.end());
test('transaction batches use one connection sequentially while pool reads can run concurrently', async () => {
  for (const transactional of [true, false]) {
    let active = 0,
      maximum = 0;
    const run = async (
      executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
    ) => {
      const task = async () => {
        active++;
        maximum = Math.max(maximum, active);
        try {
          await executor.execute(sql`select pg_sleep(0.025)`);
          return active;
        } finally {
          active--;
        }
      };
      await queryBatch(executor, [task, task]);
    };
    if (transactional) await db.transaction(run);
    else await run(db);
    assert.equal(maximum, transactional ? 1 : 2);
  }
});
test('manifest persistence rolls back metadata and presets when event recording fails', async () => {
  const fixture = await seedPurchase(db),
    base = createServiceFactories();
  const service = new AppManifestService(
    {
      createDeliverySettings: base.createDeliverySettings,
      createEventService: (tx) => ({
        ...base.createEventService(tx),
        capture: async () => {
          throw new Error('injected event failure');
        },
      }),
    },
    db,
    env,
    async () => Response.json({ version: '1', installer: { repoBranch: 'main' } }),
  );
  await assert.rejects(
    service.sync(
      fixture.app.code,
      { manifestUrl: 'https://manifest.example.test/manifest.json' },
      fixture.user.id,
    ),
  );
  const [app] = await db.select().from(apps).where(eq(apps.id, fixture.app.id));
  if (!app) throw new Error('Missing test fixture: app');
  assert.deepEqual(app.meta, fixture.app.meta);
  assert.equal(
    (
      await db
        .select()
        .from(appDeliverySettings)
        .where(eq(appDeliverySettings.appId, fixture.app.id))
    ).length,
    0,
  );
});
test('manifest synchronization preserves metadata changed while a remote fetch is in progress', async () => {
  const fixture = await seedPurchase(db),
    base = createServiceFactories();
  const service = new AppManifestService(base, db, env, async () => {
    await db
      .update(apps)
      .set({ meta: { preserved: 'concurrent change', deliveryMode: 'one_click' } })
      .where(eq(apps.id, fixture.app.id));
    return Response.json({ version: '2', installer: { repoBranch: 'main' } });
  });
  await service.sync(
    fixture.app.code,
    { manifestUrl: 'https://manifest.example.test/manifest.json' },
    fixture.user.id,
  );
  const [app] = await db.select().from(apps).where(eq(apps.id, fixture.app.id));
  if (!app) throw new Error('Missing test fixture: app');
  assert.equal((app.meta as Record<string, unknown>).preserved, 'concurrent change');
  assert.equal(
    ((app.meta as Record<string, unknown>).deliveryManifest as Record<string, unknown>).version,
    '2',
  );
});
