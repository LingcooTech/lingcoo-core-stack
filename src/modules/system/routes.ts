import type { FastifyPluginAsync } from 'fastify';
import { withTimeout } from '../../runtime/lifecycle';
import { httpError } from '../../lib/errors';
import { PublicPagesSettingsService } from '../../lib/public-pages-settings';
import { SiteSettingsService } from '../../lib/site-settings';
import { moduleNames } from '../names';

export const systemRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    return {
      status: 'ok',
      version: app.appEnv.APP_VERSION,
    };
  });

  app.get('/ready', async () => {
    if (app.isDraining) throw httpError(503, 'Service is draining');
    try {
      await withTimeout(Promise.all([app.pg.query('select 1'), app.redis.ping()]), 5000);
    } catch {
      throw httpError(503, 'Dependencies unavailable');
    }

    return {
      status: 'ready',
      version: app.appEnv.APP_VERSION,
    };
  });

  app.get('/version', async () => {
    return {
      name: app.appEnv.APP_NAME,
      version: app.appEnv.APP_VERSION,
      environment: app.appEnv.NODE_ENV,
    };
  });

  app.get('/v1/system/modules', async () => {
    return {
      items: [...moduleNames],
    };
  });

  app.get('/v1/system/site-settings', async () => {
    const [site, publicPages] = await Promise.all([
      new SiteSettingsService(app.db, app.appEnv).getPublicSettings(),
      new PublicPagesSettingsService(app.db, app.appEnv).getPublicSettings(),
    ]);
    return { ...site, publicPages };
  });
};
