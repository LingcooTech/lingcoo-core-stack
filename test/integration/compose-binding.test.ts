import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { testDatabase, seedPurchase } from './helpers';
import { appReleases, deployments, deploymentComposeBindings } from '../../src/db/schema';
import {
  ComposeBindingService,
  rotateComposeBindingKeys,
} from '../../src/modules/deployment/compose-binding';
import { definitionDigest } from '../../src/modules/app/definition';
import { getEncryptionKeys } from '../../src/lib/settings-crypto';
import { composeRuntimeFixture } from '../fixtures/compose-runtime';

const { db, pool, env } = testDatabase();
after(() => pool.end());

test('installation binding atomically pins a published same-app version and encrypted configuration across retries and key rotation', async () => {
  const { app, user } = await seedPurchase(db);
  const { definition } = composeRuntimeFixture(
    'docker.io/library/busybox@sha256:' + 'a'.repeat(64),
  );
  definition.app.code = app.code;
  const [release] = await db
    .insert(appReleases)
    .values({
      appId: app.id,
      version: 'binding-1',
      commit: 'b'.repeat(40),
      definition,
      definitionDigest: definitionDigest(definition),
      images: { app: 'docker.io/library/busybox@sha256:' + 'a'.repeat(64) },
    })
    .returning();
  const [instance] = await db
    .insert(deployments)
    .values({ appId: app.id, userId: user.id, label: 'Binding fixture', deploymentMode: 'managed' })
    .returning();
  assert.ok(instance && release);
  const service = new ComposeBindingService(db, env);
  try {
    await assert.rejects(() => service.prepare(instance.id, release.id, {}, 25371), {
      statusCode: 422,
    });
    assert.equal(
      (
        await db
          .select()
          .from(deploymentComposeBindings)
          .where(eq(deploymentComposeBindings.deploymentId, instance.id))
      ).length,
      0,
    );
    // Fixture-only published state: production Compose publication still requires future runtime evidence.
    await db
      .update(appReleases)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(appReleases.id, release.id));
    const [first, concurrent] = await Promise.all([
      service.prepare(instance.id, release.id, {}, 25371),
      service.prepare(instance.id, release.id, {}, 25371),
    ]);
    assert.deepEqual(first, concurrent);
    const password = (
      first.compose.services as Record<string, { environment: Record<string, string> }>
    ).web!.environment.PASSWORD!;
    assert.match(password, /^[a-f0-9]{64}$/);
    const [binding] = await db
      .select()
      .from(deploymentComposeBindings)
      .where(eq(deploymentComposeBindings.deploymentId, instance.id));
    assert.ok(binding);
    await assert.rejects(() =>
      db
        .update(deploymentComposeBindings)
        .set({ loopbackPort: 25372 })
        .where(eq(deploymentComposeBindings.deploymentId, instance.id)),
    );
    assert.ok(!JSON.stringify(binding).includes(password));
    await assert.rejects(() => service.prepare(instance.id, randomUUID(), {}, 25371), {
      statusCode: 409,
    });
    await assert.rejects(() => service.prepare(instance.id, release.id, {}, 25372), {
      statusCode: 409,
    });
    await assert.rejects(
      () => service.prepare(instance.id, release.id, { PASSWORD: 'changed' }, 25371),
      { statusCode: 409 },
    );
    const rotatedEnv = {
      ...env,
      SETTINGS_ENCRYPTION_CURRENT_KEY_ID: 'next',
      SETTINGS_ENCRYPTION_KEYS: JSON.stringify({
        primary: env.SETTINGS_ENCRYPTION_KEY || env.JWT_SECRET,
        next: 'integration-rotation-key-only',
      }),
    };
    await db.transaction((tx) =>
      rotateComposeBindingKeys(tx, getEncryptionKeys(rotatedEnv), false),
    );
    assert.deepEqual(
      await new ComposeBindingService(db, rotatedEnv).prepare(instance.id, release.id, {}, 25371),
      first,
    );
    await db.update(appReleases).set({ status: 'withdrawn' }).where(eq(appReleases.id, release.id));
    assert.deepEqual(
      await new ComposeBindingService(db, rotatedEnv).prepare(instance.id, release.id, {}, 25371),
      first,
    );
    await assert.rejects(() => db.delete(appReleases).where(eq(appReleases.id, release.id)));
    const other = await seedPurchase(db);
    const [foreign] = await db
      .insert(deployments)
      .values({ appId: other.app.id, userId: other.user.id, label: 'Foreign fixture' })
      .returning();
    assert.ok(foreign);
    await assert.rejects(() => service.prepare(foreign.id, release.id, {}, 25371), {
      statusCode: 422,
    });
  } finally {
    await db
      .delete(deploymentComposeBindings)
      .where(eq(deploymentComposeBindings.deploymentId, instance.id));
  }
});

test('per-server port reservations serialize concurrent allocations, retain retired ports and reject server drift', async () => {
  const { app, user } = await seedPurchase(db);
  const { definition } = composeRuntimeFixture(
    'docker.io/library/busybox@sha256:' + 'a'.repeat(64),
  );
  definition.app.code = app.code;
  const [release] = await db
    .insert(appReleases)
    .values({
      appId: app.id,
      version: 'ports-1',
      commit: 'b'.repeat(40),
      definition,
      definitionDigest: definitionDigest(definition),
      images: { app: 'docker.io/library/busybox@sha256:' + 'a'.repeat(64) },
      status: 'published',
      publishedAt: new Date(),
    })
    .returning();
  assert.ok(release);
  const host = 'port-test-' + randomUUID();
  const instances = await db
    .insert(deployments)
    .values(
      Array.from({ length: 4 }, (_, i) => ({
        appId: app.id,
        userId: user.id,
        label: 'Port fixture ' + i,
        deploymentMode: 'self_hosted' as const,
        serverHost: i === 3 ? host + '-other' : host,
      })),
    )
    .returning();
  const service = new ComposeBindingService(db, env);
  const range = { start: 25380, end: 25381 };
  try {
    const jobs = await Promise.all(
      instances.slice(0, 2).map((item) => service.prepareAllocated(item.id, release.id, {}, range)),
    );
    assert.equal(new Set(jobs.map((job) => job.healthUrl)).size, 2);
    assert.deepEqual(
      await service.prepareAllocated(instances[0]!.id, release.id, {}, range),
      jobs[0],
    );
    await assert.rejects(() => service.prepareAllocated(instances[2]!.id, release.id, {}, range), {
      statusCode: 409,
    });
    await assert.rejects(() => service.prepare(instances[2]!.id, release.id, {}, 25380), {
      statusCode: 409,
    });
    await db
      .update(deployments)
      .set({ status: 'inactive' })
      .where(eq(deployments.id, instances[0]!.id));
    await assert.rejects(() => service.prepareAllocated(instances[2]!.id, release.id, {}, range), {
      statusCode: 409,
    });
    await service.prepareAllocated(instances[3]!.id, release.id, {}, range);
    await assert.rejects(() =>
      db
        .update(deployments)
        .set({ serverHost: host + '-moved' })
        .where(eq(deployments.id, instances[1]!.id)),
    );
    assert.deepEqual(
      await service.prepareAllocated(instances[1]!.id, release.id, {}, range),
      jobs[1],
    );
    await assert.rejects(
      () => service.prepareAllocated(instances[2]!.id, release.id, {}, { start: 80, end: 80 }),
      { statusCode: 422 },
    );
  } finally {
    for (const instance of instances)
      await db
        .delete(deploymentComposeBindings)
        .where(eq(deploymentComposeBindings.deploymentId, instance.id));
  }
});
