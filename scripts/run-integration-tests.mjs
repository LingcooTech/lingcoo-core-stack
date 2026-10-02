import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error(
    'DATABASE_TEST_URL must explicitly identify a disposable database ending in _test',
  );
}
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  REDIS_URL: process.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:16379/15',
  JWT_SECRET: 'integration-test-signing-key-only',
  SETTINGS_ENCRYPTION_KEY: 'integration-test-settings-key-only',
  LOG_LEVEL: 'silent',
  RATE_LIMIT_GLOBAL_MAX: '10000',
};
function run(args) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(['scripts/run-migrations.mjs']);
run(['scripts/run-migrations.mjs']);
const files = readdirSync('test/integration').filter((file) => file.endsWith('.test.ts'));
run([
  '--import',
  'tsx',
  '--test',
  '--test-concurrency=1',
  ...files.map((f) => `test/integration/${f}`),
]);
