import fp from 'fastify-plugin';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '../db/schema';
import type { AppEnv } from '../lib/env';

type DbPluginOptions = {
  env: AppEnv;
};

export const dbPlugin = fp<DbPluginOptions>(async (app, options) => {
  const pool = new Pool({
    connectionString: options.env.DATABASE_URL
  });

  const db = drizzle(pool, { schema });

  app.decorate('pg', pool);
  app.decorate('db', db);

  app.addHook('onClose', async () => {
    await pool.end();
  });
});
