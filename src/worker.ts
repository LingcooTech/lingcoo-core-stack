import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import Redis from 'ioredis';

import * as schema from './db/schema';
import { AuditLogService } from './lib/audit-logs';
import { loadEnv } from './lib/env';
import { JobRunService } from './lib/job-runs';
import { AlertDeliveryService } from './modules/admin/alert-delivery';
import { BillingService } from './modules/billing/service';

let stopRequested = false;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getPayloadObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function getPayloadString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
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
  const alertDelivery = new AlertDeliveryService(db, env);
  let nextAlertDispatchAt = 0;

  try {
    await pool.query('select 1');
    await redis.ping();
    console.log(`[worker] started (${workerId})`);

    while (!stopRequested) {
      await jobs.recoverStaleRunningJobs(env.WORKER_STALE_JOB_TIMEOUT_MS, workerId);
      if (Date.now() >= nextAlertDispatchAt) {
        nextAlertDispatchAt = Date.now() + env.ALERT_DISPATCH_INTERVAL_MS;
        try {
          const result = await alertDelivery.dispatchActiveAlerts({ traceId: workerId });
          if (result.dispatched > 0) {
            await audits.record({
              actorType: 'job',
              actorLabel: workerId,
              action: 'observability.alerts.dispatched',
              resourceType: 'observability_alert',
              resourceId: 'active',
              outcome: 'succeeded',
              summary: `Dispatched ${result.dispatched} alert deliveries`,
              meta: result,
            });
          }
        } catch (error) {
          await audits.record({
            actorType: 'job',
            actorLabel: workerId,
            action: 'observability.alerts.dispatched',
            resourceType: 'observability_alert',
            resourceId: 'active',
            outcome: 'failed',
            summary: 'Alert dispatch failed',
            meta: {
              error: 'Alert dispatch failed',
            },
          });
          console.error('[worker] alert dispatch failed');
        }
      }
      const job = await jobs.claimNext(workerId);

      if (!job) {
        await sleep(env.WORKER_POLL_INTERVAL_MS);
        continue;
      }

      const heartbeat = setInterval(
        () => {
          if (job.claimToken) void jobs.heartbeat(job.id, job.claimToken).catch(() => {});
        },
        Math.max(250, Math.min(30000, Math.floor(env.WORKER_STALE_JOB_TIMEOUT_MS / 3))),
      );
      try {
        const result =
          job.kind === 'billing.refund.reconcile'
            ? await new BillingService(db, env).reconcileRefundByOrderNo(
                getPayloadString(getPayloadObject(job.payload).orderNo),
                { forJob: true },
              )
            : await jobs.process(job);
        const succeeded = await jobs.markSucceeded(job.id, job.claimToken!, result);
        if (!succeeded) continue;
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
            error: 'Job execution failed',
          },
        });
        console.error('[worker] job failed', { jobId: job.id, kind: job.kind });
      } finally {
        clearInterval(heartbeat);
      }
    }
  } catch (error) {
    console.error('[worker] failed to start');
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
