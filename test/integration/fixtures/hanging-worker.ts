import assert from 'node:assert/strict';
import { createWorkerRuntime } from '../../../src/composition/worker-runtime';
import { runWorker } from '../../../src/worker';
import { loadEnv } from '../../../src/lib/env';
import { JobHandlerRegistry } from '../../../src/modules/jobs/public';
assert(
  process.env.DATABASE_TEST_URL &&
    new URL(process.env.DATABASE_TEST_URL).pathname.endsWith('_test'),
);
assert(process.env.WORKER_TEST_QUEUE);
const env = {
  ...loadEnv(),
  WORKER_CONCURRENCY: 1,
  WORKER_STALE_JOB_TIMEOUT_MS: 1000,
  WORKER_POLL_INTERVAL_MS: 20,
};
const runtime = createWorkerRuntime(env);
const claim = runtime.jobs.claimNext.bind(runtime.jobs);
runtime.jobs.claimNext = (workerId: string) => claim(workerId, process.env.WORKER_TEST_QUEUE);
runtime.registry = new JobHandlerRegistry().register('email.deliver', async () => {
  process.stdout.write('FIXTURE_CLAIMED\n');
  return new Promise(() => {});
});
void runWorker(env, new AbortController().signal, runtime).catch(() => {
  process.exitCode = 1;
});
