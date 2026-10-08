import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import {
  apps,
  deployments,
  hostingNodes,
  hostingIncidents,
  hostingServices,
} from '../../src/db/schema';
import { seedPurchase, testDatabase } from './helpers';
import { HostingRepository } from '../../src/modules/deployment/hosting';
import { HostingMonitor } from '../../src/modules/deployment/hosting-monitor';
import { AlertDeliveryService } from '../../src/modules/admin/alert-delivery';
import { buildApp } from '../../src/app';
const { db, pool, env } = testDatabase();
after(() => pool.end());
const capacity = { cpuMillis: 2000, memoryMb: 4096, diskMb: 20480 };
async function fixture() {
  const f = await seedPurchase(db),
    now = new Date();
  const n = await new HostingRepository(db).createNode(
    {
      name: 'Monitor fixture',
      serverIp:
        '2001:db8::' + randomBytes(2).toString('hex') + ':' + randomBytes(2).toString('hex'),
      capacity,
    },
    now,
  );
  await db
    .update(apps)
    .set({
      meta: {
        hostingProfile: {
          enabled: true,
          domainField: 'domain',
          resources: capacity,
          monitoring: {
            projectPrefix: 'custom',
            services: ['backend', 'database'],
            backupRequired: true,
            offsiteRequired: true,
          },
        },
      },
    })
    .where(eq(apps.id, f.app.id));
  const [d] = await db
    .insert(deployments)
    .values({
      userId: f.user.id,
      appId: f.app.id,
      label: 'Expected instance',
      deploymentMode: 'managed',
      hostingNodeId: n.node.id,
      hostingState: 'ready',
      hostingResources: { cpuMillis: 1000, memoryMb: 1024, diskMb: 10240 },
      lastDeployedAt: new Date(now.getTime() - 48 * 3600000),
    })
    .returning();
  assert.ok(d);
  const report = (healthy: boolean) => ({
    dockerReady: true,
    canDeploy: false,
    available: capacity,
    containers: healthy
      ? ['backend', 'database'].map((service) => ({
          name: service,
          project: 'custom-' + d.id.replaceAll('-', ''),
          service,
          state: 'running',
          health: 'healthy',
          image: 'fixture:v1',
          memoryMb: 10,
          cpuPercent: 0,
          restarts: 0,
        }))
      : [],
    backups: healthy
      ? [
          {
            deploymentId: d.id,
            status: 'success' as const,
            completedAt: now.toISOString(),
            offsiteStatus: 'success' as const,
            offsiteAt: now.toISOString(),
          },
        ]
      : [],
  });
  await db
    .update(hostingNodes)
    .set({ report: report(false), lastReportedAt: now })
    .where(eq(hostingNodes.id, n.node.id));
  return {
    ...f,
    n,
    d,
    now,
    report,
    monitor: new HostingMonitor(db),
    rows: () => db.select().from(hostingIncidents).where(eq(hostingIncidents.resourceId, d.id)),
  };
}
test('registered instances missing entirely from node report are detected; concurrent scans dedupe and record recovery/reopen', async () => {
  const f = await fixture();
  await Promise.all([f.monitor.reconcile(f.now), f.monitor.reconcile(f.now)]);
  let rows = await f.rows();
  for (const code of ['services_missing', 'backup_missing', 'offsite_missing'])
    assert.equal(rows.find((r) => r.code === code)?.state, 'active');
  const incident = rows.find((r) => r.code === 'services_missing')!;
  assert.equal((await f.monitor.history(incident.id)).items.length, 1);
  await db
    .update(hostingNodes)
    .set({ report: f.report(true) })
    .where(eq(hostingNodes.id, f.n.node.id));
  await f.monitor.reconcile(new Date(f.now.getTime() + 1000));
  rows = await f.rows();
  assert.ok(rows.every((r) => r.state === 'resolved'));
  assert.equal((await f.monitor.history(incident.id)).items.length, 2);
  await db
    .update(hostingNodes)
    .set({ report: f.report(false) })
    .where(eq(hostingNodes.id, f.n.node.id));
  await f.monitor.reconcile(new Date(f.now.getTime() + 2000));
  rows = await f.rows();
  assert.equal(rows.find((r) => r.id === incident.id)?.occurrences, 2);
  assert.equal((await f.monitor.history(incident.id)).items.length, 3);
  assert.ok((await f.monitor.activeAlerts()).some((a) => a.id === 'hosting-' + incident.id + '-2'));
});
test('offline telemetry cannot falsely recover earlier instance faults; retired resources are distinguished from recovery', async () => {
  const f = await fixture();
  await f.monitor.reconcile(f.now);
  const incident = (await f.rows()).find((r) => r.code === 'services_missing')!;
  await db
    .update(hostingNodes)
    .set({ report: f.report(true), lastReportedAt: new Date(f.now.getTime() - 10 * 60000) })
    .where(eq(hostingNodes.id, f.n.node.id));
  await f.monitor.reconcile(f.now);
  assert.equal((await f.rows()).find((r) => r.id === incident.id)?.state, 'active');
  assert.equal((await f.rows()).find((r) => r.code === 'node_report_missing')?.state, 'active');
  assert.equal((await f.monitor.history(incident.id)).items.length, 1);
  await db.update(deployments).set({ status: 'cancelled' }).where(eq(deployments.id, f.d.id));
  await f.monitor.reconcile(new Date(f.now.getTime() + 1000));
  assert.equal((await f.rows()).find((r) => r.id === incident.id)?.resolution, 'retired');
});
test('service due and expired observations never stop a deployment or alter software/hosting terms', async () => {
  const f = await fixture();
  const expiry = new Date(f.now.getTime() + 86400000);
  const [service] = await db
    .insert(hostingServices)
    .values({
      deploymentId: f.d.id,
      source: 'manual',
      interval: 'month',
      periods: 1,
      anchorAt: new Date(f.now.getTime() - 29 * 86400000),
      expiresAt: expiry,
      graceDays: 7,
      retentionDays: 30,
    })
    .returning();
  assert.ok(service);
  await f.monitor.reconcile(f.now);
  assert.equal((await f.rows()).find((r) => r.code === 'service_due')?.state, 'active');
  await f.monitor.reconcile(new Date(expiry.getTime() + 1000));
  const rows = await f.rows();
  assert.equal(rows.find((r) => r.code === 'service_due')?.state, 'resolved');
  assert.equal(rows.find((r) => r.code === 'service_expired')?.state, 'active');
  assert.equal(
    (await db.select().from(deployments).where(eq(deployments.id, f.d.id)))[0]?.status,
    'active',
  );
  assert.equal(
    (await db.select().from(hostingServices).where(eq(hostingServices.id, service.id)))[0]?.version,
    1,
  );
  await db
    .update(hostingServices)
    .set({ expiresAt: new Date(expiry.getTime() + 30 * 86400000) })
    .where(eq(hostingServices.id, service.id));
  await f.monitor.reconcile(new Date(expiry.getTime() + 2000));
  assert.equal((await f.rows()).find((r) => r.code === 'service_expired')?.state, 'resolved');
});
test('unknown application monitoring is explicit, permissions protect incidents and offline scan runs with notifications disabled', async () => {
  const f = await fixture();
  await db.update(apps).set({ meta: {} }).where(eq(apps.id, f.app.id));
  let prepared = false;
  // No external channels are configured in the isolated environment.
  const delivery = new AlertDeliveryService(
    db,
    env,
    async () => {
      throw new Error('Disabled notifications must not load recipients');
    },
    async () => {
      await f.monitor.reconcile(f.now);
      prepared = true;
    },
  );
  await delivery.dispatchActiveAlerts();
  assert.equal(prepared, true);
  const [config] = await db
    .select()
    .from(hostingIncidents)
    .where(
      and(
        eq(hostingIncidents.resourceId, f.d.id),
        eq(hostingIncidents.code, 'monitoring_configuration'),
      ),
    );
  assert.equal(config?.state, 'active');
  const app = await buildApp(env);
  try {
    const headers = { authorization: 'Bearer ' + app.jwt.sign({ sub: f.user.id, kind: 'user' }) };
    const denied = await app.inject({ method: 'GET', url: '/v1/admin/hosting/incidents', headers });
    assert.equal(denied.statusCode, 403);
    const view = await f.monitor.list({ state: 'active', limit: 1, offset: 0 });
    assert.equal(view.items.length, 1);
    assert.ok(view.total >= 1);
    assert.ok(view.lastScanAt);
    assert.ok(!JSON.stringify(view).includes(f.n.reportToken));
  } finally {
    await app.close();
  }
});
