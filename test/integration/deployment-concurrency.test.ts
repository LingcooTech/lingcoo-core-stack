import { createServiceFactories } from '../../src/composition/service-factories';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { deployments, entitlements } from '../../src/db/schema';
import { encryptJson } from '../../src/lib/settings-crypto';
import { BillingService } from '../../src/modules/billing/service';
import { DeploymentService } from '../../src/modules/deployment/service';
import { seedPurchase, testDatabase } from './helpers';

const { db, pool, env } = testDatabase();
after(() => pool.end());
async function fixture() {
  const seeded = await seedPurchase(db);
  await new BillingService(createServiceFactories(), db, env).handlePaymentNotification({
    kind: 'paid',
    provider: 'wechat_pay',
    providerEventId: seeded.order.orderNo,
    orderNo: seeded.order.orderNo,
    providerOrderId: 'fixture',
    amount: 100,
    currency: 'CNY',
    paidAt: new Date(),
    payload: {},
  });
  const [entitlement] = await db
    .select()
    .from(entitlements)
    .where(eq(entitlements.sourceId, seeded.order.id));
  if (!entitlement) throw new Error('Missing test fixture: entitlement');
  const input = {
    userId: seeded.user.id,
    appCode: seeded.app.code,
    entitlementId: entitlement.id,
    label: 'Fixture',
    environment: 'production',
  };
  return { ...seeded, input, service: new DeploymentService(createServiceFactories(), db, env) };
}
test('concurrent deployment creation cannot exceed an entitlement quota', async () => {
  const { service, input } = await fixture();
  const results = await Promise.allSettled([
    service.createDeployment(input),
    service.createDeployment(input),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(
    (await db.select().from(deployments).where(eq(deployments.entitlementId, input.entitlementId)))
      .length,
    1,
  );
});
test('a deployment token can be exchanged once even under concurrency', async () => {
  const { service, input } = await fixture();
  const deployment = await service.createDeployment(input);
  const issued = await service.issueDeploymentToken({
    deploymentId: deployment.id,
    userId: input.userId,
    expiresInHours: 1,
  });
  const results = await Promise.allSettled([
    service.exchangeBootstrapToken(issued.token),
    service.exchangeBootstrapToken(issued.token),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejection = results.find((result) => result.status === 'rejected');
  assert(rejection?.status === 'rejected');
  assert.equal(rejection.reason.statusCode, 401);
});
test('pending actions cannot be overwritten and completion is safely replayed', async () => {
  const { service, input } = await fixture();
  const deployment = await service.createDeployment(input);
  const token = 'fixture-action-report-token';
  await db
    .update(deployments)
    .set({
      meta: {
        runtimeAssetsUpdate: { available: { runtime: 'registry.example.test/app:fixture' } },
        runtimeStatusReport: { token: encryptJson({ token }, env.SETTINGS_ENCRYPTION_KEY!) },
      },
    })
    .where(eq(deployments.id, deployment.id));
  const action = {
    deploymentId: deployment.id,
    userId: input.userId,
    kind: 'apply_runtime_images' as const,
  };
  const results = await Promise.allSettled([
    service.requestDeploymentAction(action),
    service.requestDeploymentAction(action),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const pulled = await service.pullDeploymentAction({ deploymentId: deployment.id, token });
  assert(pulled.action);
  const complete = {
    deploymentId: deployment.id,
    token,
    actionId: pulled.action.id,
    status: 'completed' as const,
  };
  assert.deepEqual(await service.completeDeploymentAction(complete), { ok: true });
  assert.deepEqual(await service.completeDeploymentAction(complete), { ok: true });
});
