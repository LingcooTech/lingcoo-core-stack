import type { FastifyPluginAsync } from 'fastify';

export const systemRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    return {
      name: app.appEnv.APP_NAME,
      status: 'ok',
      docs: '/docs'
    };
  });

  app.get('/health', async () => {
    return {
      status: 'ok'
    };
  });

  app.get('/ready', async () => {
    await app.pg.query('select 1');
    await app.redis.ping();

    return {
      status: 'ready'
    };
  });

  app.get('/v1/system/modules', async () => {
    return {
      items: ['system', 'auth', 'billing', 'license', 'event']
    };
  });
};
