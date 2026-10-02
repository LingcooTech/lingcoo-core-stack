import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import Redis from 'ioredis';
import * as schema from '../db/schema';
import type { AppEnv } from '../lib/env';
export function createDatabase(env: AppEnv) {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  });
  return { pool, db: drizzle(pool, { schema }) };
}
export function createRedis(env: AppEnv) {
  return new Redis(env.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    connectTimeout: 5000,
    commandTimeout: 5000,
  });
}
