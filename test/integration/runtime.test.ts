import { requireResult } from '../../src/db/required-result';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { after, test } from 'node:test';
import { withTimeout } from '../../src/runtime/lifecycle';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/app';
import { createWorkerRuntime } from '../../src/composition/worker-runtime';
import { jobRuns } from '../../src/db/schema';
import { JobHandlerRegistry } from '../../src/modules/jobs/public';
import { runWorker } from '../../src/worker';
import { testDatabase } from './helpers';
const { db, pool, env } = testDatabase();
after(() => pool.end());
test('worker drains with a deadline even when a handler ignores cancellation', async (t) => {
  const workerEnv = {
    ...env,
    WORKER_CONCURRENCY: 1,
    WORKER_POLL_INTERVAL_MS: 20,
    WORKER_SHUTDOWN_TIMEOUT_MS: 100,
  };
  const runtime = createWorkerRuntime(workerEnv);
  let started!: () => void;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  runtime.registry = new JobHandlerRegistry()
    .register('email.deliver', async () => {
      started();
      return new Promise(() => {});
    })
    .register('notifications.project', async () => ({}))
    .register('billing.refund.reconcile', async () => ({}))
    .register('alert.webhook.deliver', async () => ({}));
  const queue = randomUUID();
  const claim = runtime.jobs.claimNext.bind(runtime.jobs);
  t.mock.method(runtime.jobs, 'claimNext', (workerId: string) => claim(workerId, queue));
  const job = await runtime.jobs.enqueue({
    queue,
    kind: 'email.deliver',
    payload: { to: 'worker@example.test', subject: 'Fixture', text: 'Fixture' },
    dedupeKey: randomUUID(),
  });
  const controller = new AbortController();
  const worker = runWorker(workerEnv, controller.signal, runtime);
  try {
    await withTimeout(running, 10000);
    const start = Date.now();
    controller.abort();
    await worker;
    assert(Date.now() - start < 2000);
  } finally {
    controller.abort();
    await worker;
  }
  const [row] = await db.select().from(jobRuns).where(eq(jobRuns.id, job!.id));
  if (!row) throw new Error('Missing test fixture: row');
  assert.equal(row.status, 'running');
  // Terminated work remains fenced by its lease and is recovered by the next worker.
  await db
    .update(jobRuns)
    .set({ leaseExpiresAt: new Date(0) })
    .where(eq(jobRuns.id, row.id));
  const recovery = createWorkerRuntime(workerEnv);
  try {
    await recovery.jobs.recoverStaleRunningJobs(workerEnv.WORKER_STALE_JOB_TIMEOUT_MS, 'recovery');
  } finally {
    recovery.redis.disconnect();
    await recovery.pool.end();
  }
  assert.equal(
    requireResult(
      (await db.select().from(jobRuns).where(eq(jobRuns.id, row.id)))[0],
      'fixture array element',
    ).status,
    'pending',
  );
});
test('readiness rejects draining and unavailable dependencies without raw errors', async (t) => {
  const app = await buildApp(env);
  try {
    assert.equal((await app.inject('/ready')).statusCode, 200);
    app.isDraining = true;
    assert.equal((await app.inject('/ready')).statusCode, 503);
    app.isDraining = false;
    t.mock.method(app.redis, 'ping', async () => {
      throw new Error('fixture-private-runtime-secret');
    });
    const failed = await app.inject('/ready');
    assert.equal(failed.statusCode, 503);
    assert(!failed.body.includes('fixture-private-runtime-secret'));
  } finally {
    await app.close();
  }
});

test('SIGKILL leaves a lease that another worker can recover', async () => {
  const { spawn } = await import('node:child_process');
  const { setTimeout: delay } = await import('node:timers/promises');
  const queue = randomUUID();
  const runtime = createWorkerRuntime(env);
  const job = await runtime.jobs.enqueue({
    queue,
    kind: 'email.deliver',
    payload: { to: 'kill@example.test', subject: 'Fixture', text: 'Fixture' },
    dedupeKey: randomUUID(),
  });
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'test/integration/fixtures/hanging-worker.ts'],
    { env: { ...process.env, WORKER_TEST_QUEUE: queue }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const exit = once(child, 'exit');
  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        child.stdout.on('data', (chunk: Buffer) => {
          if (chunk.toString().includes('FIXTURE_CLAIMED')) resolve();
        });
        child.once('error', reject);
        child.once('exit', () => reject(new Error('Fixture exited before claiming')));
      }),
      20000,
    );
    child.kill('SIGKILL');
    const [, signal] = await exit;
    assert.equal(signal, 'SIGKILL');
    assert.equal(
      requireResult(
        (await db.select().from(jobRuns).where(eq(jobRuns.id, job.id)))[0],
        'fixture array element',
      ).status,
      'running',
    );
    await delay(1200);
    await runtime.jobs.recoverStaleRunningJobs(1000, 'kill-recovery');
    assert.equal(
      requireResult(
        (await db.select().from(jobRuns).where(eq(jobRuns.id, job.id)))[0],
        'fixture array element',
      ).status,
      'pending',
    );
  } finally {
    child.kill('SIGKILL');
    await exit;
    if (child.pid) await rm(`/tmp/lingcoo-worker-${child.pid}.json`, { force: true });
    runtime.redis.disconnect();
    await runtime.pool.end();
  }
});
