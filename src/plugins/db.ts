import fp from 'fastify-plugin';
import { createDatabase } from '../composition/connections';
import type { AppEnv } from '../lib/env';

type DbPluginOptions = {
  env: AppEnv;
};

export const dbPlugin = fp<DbPluginOptions>(async (app, options) => {
  const { pool, db } = createDatabase(options.env);

  app.decorate('pg', pool);
  app.decorate('db', db);

  app.addHook('onClose', async () => {
    await pool.end();
  });
});
