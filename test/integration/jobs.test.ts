import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { jobRuns, jobAttempts } from '../../src/db/schema';
import { JobRunService } from '../../src/lib/job-runs';
import { testDatabase } from './helpers';

const { db, pool, env } = testDatabase();
after(() => pool.end());
const jobs = new JobRunService(db, env);
async function queued(maxAttempts = 3) {
  const queue = `fixture_${randomUUID()}`;
  const job = await jobs.enqueue({
    queue,
    kind: 'email.deliver',
    payload: {
      token: 'fixture-private-secret',
      to: 'fixture@example.test',
      text: 'fixture',
      subject: 'fixture',
    },
    maxAttempts,
  });
  return { queue, job };
}
test('failed tasks are automatically claimable after backoff', async () => {
  const { queue, job } = await queued();
  const first = await jobs.claimNext('worker-a', queue);
  assert(first);
  assert.equal(
    (await jobs.markFailed(first, new Error('password=fixture-private-secret')))?.status,
    'pending',
  );
  assert.equal(await jobs.claimNext('worker-a', queue), null);
  await db
    .update(jobRuns)
    .set({ availableAt: new Date(0) })
    .where(eq(jobRuns.id, job.id));
  const second = await jobs.claimNext('worker-b', queue);
  assert(second);
  assert.equal(second.attempts, 2);
  assert.notEqual(second.claimToken, first.claimToken);
  await jobs.markSucceeded(second.id, second.claimToken!);
});
test('concurrent workers cannot claim the same job', async () => {
  const { queue } = await queued();
  const claimed = await Promise.all([
    jobs.claimNext('worker-a', queue),
    jobs.claimNext('worker-b', queue),
  ]);
  assert.equal(claimed.filter(Boolean).length, 1);
  const owned = claimed.find(Boolean)!;
  await jobs.markSucceeded(owned.id, owned.claimToken!);
});
test('expired leases recover and stale workers cannot overwrite the new result', async () => {
  const { queue, job } = await queued();
  const first = await jobs.claimNext('worker-a', queue);
  assert(first);
  await db
    .update(jobRuns)
    .set({ leaseExpiresAt: new Date(0) })
    .where(eq(jobRuns.id, job.id));
  assert.equal(await jobs.heartbeat(first.id, first.claimToken!), false);
  await jobs.recoverStaleRunningJobs(1, 'recovery');
  await db
    .update(jobRuns)
    .set({ availableAt: new Date(0) })
    .where(eq(jobRuns.id, job.id));
  const second = await jobs.claimNext('worker-b', queue);
  assert(second);
  assert.equal(await jobs.markSucceeded(first.id, first.claimToken!, { stale: true }), null);
  assert.equal(await jobs.markFailed(first, new Error('late failure')), null);
  assert(await jobs.markSucceeded(second.id, second.claimToken!, { completed: true }));
  const attempts = await db.select().from(jobAttempts).where(eq(jobAttempts.jobId, job.id));
  assert.equal(attempts.length, 2);
  assert(attempts.some((attempt) => attempt.status === 'timed_out'));
});
test('exhausted tasks retain attempts when an administrator grants one retry', async () => {
  const { queue, job } = await queued(1);
  const first = await jobs.claimNext('worker-a', queue);
  assert(first);
  assert.equal((await jobs.markFailed(first, new Error('fixture')))?.status, 'dead');
  await jobs.retry(job.id);
  const second = await jobs.claimNext('worker-b', queue);
  assert(second);
  assert.equal(second.attempts, 2);
  assert.equal(second.maxAttempts, 2);
  await jobs.markSucceeded(second.id, second.claimToken!);
  const view = await jobs.listJobs({ limit: 100, offset: 0 });
  assert(!JSON.stringify(view).includes('fixture-private-secret'));
  assert(
    !view.items.some((item) => 'payload' in item || 'claimToken' in item || 'lockedBy' in item),
  );
});
