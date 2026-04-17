import type { FastifyPluginAsync } from 'fastify';
import { SiteSettingsService } from '../../lib/site-settings';
import { moduleNames } from '../names';

export const systemRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    return {
      status: 'ok',
      version: app.appEnv.APP_VERSION
    };
  });

  app.get('/ready', async () => {
    await app.pg.query('select 1');
    await app.redis.ping();

    return {
      status: 'ready',
      version: app.appEnv.APP_VERSION
    };
  });

  app.get('/version', async () => {
    return {
      name: app.appEnv.APP_NAME,
      version: app.appEnv.APP_VERSION,
      environment: app.appEnv.NODE_ENV
    };
  });

  app.get('/v1/system/modules', async () => {
    return {
      items: [...moduleNames]
    };
  });

  app.get('/v1/system/site-settings', async () => {
    return new SiteSettingsService(app.db, app.appEnv).getPublicSettings();
  });
};
