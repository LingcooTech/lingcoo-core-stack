import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import Redis from 'ioredis';

import * as schema from './db/schema';
import { AuditLogService } from './lib/audit-logs';
import { loadEnv } from './lib/env';
import { JobRunService } from './lib/job-runs';

let stopRequested = false;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const env = loadEnv();
  const workerId = `worker_${randomUUID()}`;
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
  });
  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
  });
  const db = drizzle(pool, { schema });
  const jobs = new JobRunService(db, env);
  const audits = new AuditLogService(db);

  try {
    await pool.query('select 1');
    await redis.ping();
    console.log(`[worker] started (${workerId})`);

    while (!stopRequested) {
      await jobs.recoverStaleRunningJobs(env.WORKER_STALE_JOB_TIMEOUT_MS, workerId);
      const job = await jobs.claimNext(workerId);

      if (!job) {
        await sleep(env.WORKER_POLL_INTERVAL_MS);
        continue;
      }

      try {
        const result = await jobs.process(job);
        await jobs.markSucceeded(job.id, result);
        await audits.record({
          actorType: 'job',
          actorLabel: workerId,
          action: `job.${job.kind}`,
          resourceType: 'job_run',
          resourceId: job.id,
          outcome: 'succeeded',
          summary: `${job.kind} completed`,
          meta: {
            queue: job.queue,
            attempts: job.attempts,
            result,
          },
        });
      } catch (error) {
        const updated = await jobs.markFailed(job, error);
        await audits.record({
          actorType: 'job',
          actorLabel: workerId,
          action: `job.${job.kind}`,
          resourceType: 'job_run',
          resourceId: job.id,
          outcome: 'failed',
          summary:
            updated?.status === 'dead'
              ? `${job.kind} exhausted retries`
              : `${job.kind} failed and will retry`,
          meta: {
            queue: job.queue,
            attempts: job.attempts,
            status: updated?.status ?? 'failed',
            error: error instanceof Error ? error.message : 'Unknown worker error',
          },
        });
        console.error('[worker] job failed', { jobId: job.id, kind: job.kind, error });
      }
    }
  } catch (error) {
    console.error('[worker] failed to start', error);
    process.exit(1);
  }

  await redis.quit();
  await pool.end();
  console.log('[worker] stopped');
}

const shutdown = () => {
  if (stopRequested) {
    return;
  }

  stopRequested = true;
  console.log('[worker] stopping');
};

process.on('SIGINT', () => {
  shutdown();
});

process.on('SIGTERM', () => {
  shutdown();
});

void main();
