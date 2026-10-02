import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import Redis from 'ioredis';
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 1500,
  statement_timeout: 1000,
});
const redis = new Redis(process.env.REDIS_URL, {
  lazyConnect: true,
  connectTimeout: 1500,
  commandTimeout: 1500,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
});
redis.on('error', () => {});
let deadline;
try {
  const files = (await readdir('/tmp')).filter((name) => /^lingcoo-worker-\d+\.json$/.test(name));
  const health = await Promise.all(
    files.map(async (name) => JSON.parse(await readFile('/tmp/' + name, 'utf8'))),
  );
  if (
    !health.some(
      (entry) => Number.isFinite(entry.updatedAt) && Date.now() - entry.updatedAt < 20000,
    )
  )
    throw new Error('Worker heartbeat unavailable');
  await Promise.race([
    Promise.all([
      client.connect().then(() => client.query('select id from job_runs limit 1')),
      redis.connect().then(() => redis.ping()),
    ]),
    new Promise((_resolve, reject) => {
      deadline = setTimeout(() => reject(new Error('Worker dependencies unavailable')), 2000);
    }),
  ]);
} catch {
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  redis.disconnect();
  await client.end().catch(() => {});
}
