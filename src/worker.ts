import { pruneIdempotencyResults } from './modules/idempotency/public';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createWorkerRuntime } from './composition/worker-runtime';
import { loadEnv, type AppEnv } from './lib/env';
export async function runWorker(
  env: AppEnv,
  signal: AbortSignal,
  runtime = createWorkerRuntime(env),
) {
  const workerId = `worker_${randomUUID()}`;
  const { pool, redis, jobs, audits, registry, alertDelivery } = runtime;
  const active = new Set<AbortController>();
  let stop = false,
    shutdownTimer: ReturnType<typeof setTimeout> | undefined,
    nextMaintenance = 0;
  const shutdown = () => {
    stop = true;
    shutdownTimer = setTimeout(
      () => active.forEach((c) => c.abort()),
      env.WORKER_SHUTDOWN_TIMEOUT_MS,
    );
  };
  signal.addEventListener('abort', shutdown, { once: true });
  if (signal.aborted) shutdown();
  const record = async (input: Parameters<typeof audits.record>[0]) => {
    try {
      await audits.record(input);
    } catch {
      console.error('[worker] audit recording failed');
    }
  };
  const consume = async (slot: number) => {
    while (!stop) {
      if (slot === 0 && Date.now() >= nextMaintenance) {
        nextMaintenance = Date.now() + env.ALERT_DISPATCH_INTERVAL_MS;
        await jobs.recoverStaleRunningJobs(env.WORKER_STALE_JOB_TIMEOUT_MS, workerId);
        await jobs.pruneCompleted(env.JOB_RETENTION_DAYS);
        await pruneIdempotencyResults(runtime.db);
        try {
          await alertDelivery.dispatchActiveAlerts({ traceId: workerId });
        } catch {
          console.error('[worker] alert dispatch failed');
        }
      }
      const job = await jobs.claimNext(`${workerId}_${slot}`);
      if (!job) {
        await delay(env.WORKER_POLL_INTERVAL_MS, undefined, { signal }).catch(() => {});
        continue;
      }
      const controller = new AbortController();
      active.add(controller);
      let heartbeatInFlight = false;
      const heartbeat = setInterval(
        () => {
          if (heartbeatInFlight) return;
          heartbeatInFlight = true;
          void jobs
            .heartbeat(job.id, job.claimToken!)
            .then((owned) => {
              if (!owned) controller.abort();
            })
            .catch(() => controller.abort())
            .finally(() => {
              heartbeatInFlight = false;
            });
        },
        Math.max(250, Math.min(30000, Math.floor(env.WORKER_STALE_JOB_TIMEOUT_MS / 3))),
      );
      try {
        const result = await registry.run(job, controller.signal);
        const succeeded = await jobs.markSucceeded(job.id, job.claimToken!, result);
        if (succeeded)
          await record({
            actorType: 'job',
            actorLabel: workerId,
            action: `job.${job.kind}`,
            resourceType: 'job_run',
            resourceId: job.id,
            outcome: 'succeeded',
            summary: 'Job completed',
            meta: { queue: job.queue, attempts: job.attempts },
          });
      } catch (error) {
        const updated = await jobs.markFailed(job, error);
        if (updated)
          await record({
            actorType: 'job',
            actorLabel: workerId,
            action: `job.${job.kind}`,
            resourceType: 'job_run',
            resourceId: job.id,
            outcome: 'failed',
            summary: 'Job execution failed',
            meta: { queue: job.queue, attempts: job.attempts, status: updated.status },
          });
      } finally {
        clearInterval(heartbeat);
        active.delete(controller);
      }
    }
  };
  try {
    await pool.query('select 1');
    await redis.ping();
    console.info('[worker] started', { workerId, concurrency: env.WORKER_CONCURRENCY });
    await Promise.all(Array.from({ length: env.WORKER_CONCURRENCY }, (_, slot) => consume(slot)));
  } finally {
    stop = true;
    active.forEach((c) => c.abort());
    clearTimeout(shutdownTimer);
    signal.removeEventListener('abort', shutdown);
    await Promise.allSettled([redis.quit(), pool.end()]);
    console.info('[worker] stopped');
  }
}
if (require.main === module) {
  const shutdown = new AbortController();
  process.once('SIGTERM', () => shutdown.abort());
  process.once('SIGINT', () => shutdown.abort());
  void runWorker(loadEnv(), shutdown.signal).catch(() => {
    console.error('[worker] runtime failed');
    process.exitCode = 1;
  });
}
