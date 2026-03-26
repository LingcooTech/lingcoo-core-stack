import Redis from 'ioredis';
import { Pool } from 'pg';

import { loadEnv } from './lib/env';

async function main() {
  const env = loadEnv();
  const pool = new Pool({
    connectionString: env.DATABASE_URL
  });
  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 2
  });

  try {
    await pool.query('select 1');
    await redis.ping();
    console.log('[worker] started');
  } catch (error) {
    console.error('[worker] failed to start', error);
    process.exit(1);
  }

  const timer = setInterval(async () => {
    try {
      await pool.query('select 1');
      await redis.ping();
      console.log('[worker] heartbeat');
    } catch (error) {
      console.error('[worker] heartbeat failed', error);
    }
  }, 60000);

  const shutdown = async () => {
    clearInterval(timer);
    await redis.quit();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });

  process.on('SIGTERM', () => {
    void shutdown();
  });
}

void main();
