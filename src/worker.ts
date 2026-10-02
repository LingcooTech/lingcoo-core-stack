import { withTimeout, withAbort } from './runtime/lifecycle';
import { pruneIdempotencyResults } from './modules/idempotency/public';
import { randomUUID } from 'node:crypto';
import { writeFile, rm } from 'node:fs/promises';
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
  const polling = new AbortController();
  let healthTimer: ReturnType<typeof setInterval> | undefined;
  const healthPath = `/tmp/lingcoo-worker-${process.pid}.json`;
  let stop = false,
    shutdownTimer: ReturnType<typeof setTimeout> | undefined,
    nextMaintenance = 0;
  const shutdown = () => {
    if (stop) return;
    stop = true;
    polling.abort();
    clearInterval(healthTimer);
    void rm(healthPath, { force: true });
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
        await delay(env.WORKER_POLL_INTERVAL_MS, undefined, { signal: polling.signal }).catch(
          () => {},
        );
        continue;
      }
      if (stop) break;
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
        const result = await withAbort(registry.run(job, controller.signal), controller.signal);
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
        if (controller.signal.aborted) continue; // Leave the lease for recovery; never write a late result.
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
    await withTimeout(Promise.all([pool.query('select 1'), redis.ping()]), 5000);
    const writeHealth = () =>
      writeFile(healthPath, JSON.stringify({ updatedAt: Date.now(), workerId })).catch(() => {});
    await writeHealth();
    healthTimer = setInterval(() => {
      void writeHealth();
    }, 5000);
    console.info('[worker] started', { workerId, concurrency: env.WORKER_CONCURRENCY });
    const consumers = Array.from({ length: env.WORKER_CONCURRENCY }, (_, slot) => consume(slot));
    try {
      await Promise.all(consumers);
    } catch (error) {
      stop = true;
      polling.abort();
      active.forEach((c) => c.abort());
      await withTimeout(Promise.allSettled(consumers), 5000).catch(() => {});
      throw error;
    }
  } finally {
    stop = true;
    polling.abort();
    active.forEach((c) => c.abort());
    clearTimeout(shutdownTimer);
    clearInterval(healthTimer);
    await rm(healthPath, { force: true });
    signal.removeEventListener('abort', shutdown);
    redis.disconnect();
    await withTimeout(pool.end(), 5000).catch(() => {});
    console.info('[worker] stopped');
  }
}
if (require.main === module) {
  const shutdown = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const env = loadEnv();
    const terminate = () => {
      deadline ??= setTimeout(() => process.exit(1), env.WORKER_SHUTDOWN_TIMEOUT_MS + 10000);
      deadline.unref();
      shutdown.abort();
    };
    process.once('SIGTERM', terminate);
    process.once('SIGINT', terminate);
    void runWorker(env, shutdown.signal).catch(() => {
      console.error('[worker] runtime failed');
      process.exit(1);
    });
  } catch {
    console.error('[worker] invalid runtime configuration');
    process.exitCode = 1;
  }
}
