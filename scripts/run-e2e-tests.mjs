import { spawnSync } from 'node:child_process';
const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test'))
  throw new Error('E2E requires an explicit disposable _test database');
const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    REDIS_URL: process.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:16379/15',
    JWT_SECRET: 'integration-test-signing-key-only',
    SETTINGS_ENCRYPTION_KEY: 'integration-test-settings-key-only',
    PORT: '15439',
    APP_VERSION: 'e2e-smoke',
    LOG_LEVEL: 'silent',
    RATE_LIMIT_GLOBAL_MAX: '10000',
  },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
