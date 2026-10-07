import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app';
import { deployments, deploymentDomains } from '../../src/db/schema';
import { CustomDomainService } from '../../src/modules/deployment/custom-domains';
import { HostingRepository } from '../../src/modules/deployment/hosting';
import { testDatabase, seedPurchase } from './helpers';
const { db, pool, env } = testDatabase();
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  app = await buildApp(env);
});
after(async () => {
  await app.close();
  await pool.end();
});
async function fixture() {
  const f = await seedPurchase(db);
  const node = await new HostingRepository(db).createNode(
    {
      name: 'Domain test',
      serverIp:
        '198.18.' + Math.floor(Math.random() * 255) + '.' + (1 + Math.floor(Math.random() * 254)),
      capacity: { cpuMillis: 1000, memoryMb: 1024, diskMb: 10240 },
    },
    new Date(),
  );
  const [deployment] = await db
    .insert(deployments)
    .values({
      userId: f.user.id,
      appId: f.app.id,
      label: 'Domain fixture',
      hostingResources: { cpuMillis: 1000, memoryMb: 1024, diskMb: 10240 },
      deploymentMode: 'managed',
      hostingState: 'ready',
      hostingNodeId: node.node.id,
      hostedDomain: 'test-' + randomUUID() + '.app.lingcoo.com',
      serverHost: node.node.serverIp,
    })
    .returning();
  return {
    ...f,
    deployment: deployment!,
    node,
    headers: { authorization: 'Bearer ' + app.jwt.sign({ sub: f.user.id, kind: 'user' }) },
  };
}
test('custom domain routes enforce ownership, uniqueness and platform reservations', async () => {
  const f = await fixture();
  const other = await seedPurchase(db);
  const root = '/v1/deployments/' + f.deployment.id + '/domains';
  const denied = await app.inject({
    method: 'GET',
    url: root,
    headers: { authorization: 'Bearer ' + app.jwt.sign({ sub: other.user.id, kind: 'user' }) },
  });
  assert.equal(denied.statusCode, 404);
  const hostname = 'shop-' + randomUUID() + '.example.com';
  const response = await app.inject({
    method: 'POST',
    url: root,
    headers: f.headers,
    payload: { hostname },
  });
  assert.equal(response.statusCode, 201, response.body);
  const d = response.json();
  assert.equal(d.state, 'pending_dns');
  assert.equal(d.accessUrl, null);
  const replay = await app.inject({
    method: 'POST',
    url: root,
    headers: f.headers,
    payload: { hostname },
  });
  assert.equal(replay.json().id, d.id);
  const reserved = await app.inject({
    method: 'POST',
    url: root,
    headers: f.headers,
    payload: { hostname: 'hijack.app.lingcoo.com' },
  });
  assert.equal(reserved.statusCode, 422);
  const second = await fixture();
  await assert.rejects(
    new CustomDomainService(db, env).add(second.deployment.id, second.user.id, hostname),
  );
  await db.delete(deploymentDomains).where(eq(deploymentDomains.id, d.id));
});
test('ownership TXT and exact DNS target are mandatory before ingress and HTTPS readiness', async () => {
  const f = await fixture();
  let token = 'wrong';
  let ip = '192.0.2.250';
  let tls = false;
  const service = new CustomDomainService(
    db,
    env,
    {
      resolve4: async () => [ip],
      resolve6: async () => [],
      resolveCname: async () => [f.deployment.hostedDomain!],
      resolveTxt: async () => [[token]],
    },
    async () => {
      if (!tls) throw new Error('TLS not ready');
    },
  );
  const domain = await service.add(
    f.deployment.id,
    f.user.id,
    'custom-' + randomUUID() + '.example.com',
  );
  await assert.rejects(service.verify(f.deployment.id, f.user.id, domain.id));
  token = domain.verificationValue;
  await assert.rejects(service.verify(f.deployment.id, f.user.id, domain.id));
  ip = f.deployment.serverHost!;
  assert.equal((await service.verify(f.deployment.id, f.user.id, domain.id)).state, 'pending_tls');
  await assert.rejects(service.nodeComplete(f.node.node.id, f.deployment.id, domain.id));
  tls = true;
  await service.nodeComplete(f.node.node.id, f.deployment.id, domain.id);
  assert.equal((await service.list(f.deployment.id, f.user.id)).items[0]!.state, 'ready');
  await service.remove(f.deployment.id, f.user.id, domain.id);
  // A stale alias health callback must never acknowledge removal and release ownership.
  await assert.rejects(service.nodeComplete(f.node.node.id, f.deployment.id, domain.id));
  assert.equal((await service.list(f.deployment.id, f.user.id)).items[0]!.state, 'removing');
  await service.nodeComplete(f.node.node.id, f.deployment.id, domain.id, true);
  assert.equal((await service.list(f.deployment.id, f.user.id)).items.length, 0);
});

test('automatic DNS retries rotate unresolved records instead of starving later customers', async () => {
  const f = await fixture();
  const service = new CustomDomainService(db, env, {
    resolve4: async () => [],
    resolve6: async () => [],
    resolveCname: async () => [],
    resolveTxt: async () => {
      throw new Error('DNS not configured');
    },
  });
  const domain = await service.add(
    f.deployment.id,
    f.user.id,
    'waiting-' + randomUUID() + '.example.com',
  );
  await db
    .update(deploymentDomains)
    .set({ updatedAt: new Date('2000-01-01T00:00:00Z') })
    .where(eq(deploymentDomains.id, domain.id));
  await service.reconcile();
  const [row] = await db
    .select()
    .from(deploymentDomains)
    .where(eq(deploymentDomains.id, domain.id));
  assert.equal(row!.state, 'pending_dns');
  assert(row!.updatedAt.getTime() > new Date('2000-01-01T00:00:00Z').getTime());
  await db.delete(deploymentDomains).where(eq(deploymentDomains.id, domain.id));
});
