import type { FastifyPluginAsync } from 'fastify';

import { buildAppCodeUserRateLimitKey } from '../../lib/rate-limit';
import {
  appCodeParamsSchema,
  appSecretParamsSchema,
  createAppSecretSchema,
  createAppSessionSchema,
  syncDeliveryManifestSchema,
  upsertAppSchema
} from './schemas';
import { AppService } from './service';

export const appRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/apps', async () => {
    return {
      items: await new AppService(app.db).listActiveApps()
    };
  });

  app.get('/v1/apps/:appCode', async (request) => {
    const params = appCodeParamsSchema.parse(request.params);
    return new AppService(app.db).getPublicApp(params.appCode);
  });

  app.get('/v1/apps/:appCode/catalog', async (request) => {
    const params = appCodeParamsSchema.parse(request.params);
    return new AppService(app.db).getAppCatalog(params.appCode);
  });

  app.post('/v1/apps/:appCode/session', async (request) => {
    const params = appCodeParamsSchema.parse(request.params);
    const payload = createAppSessionSchema.parse(request.body);
    const auth = await new AppService(app.db).authenticateAppSecret(params.appCode, payload.appSecret);

    return {
      token: app.jwt.sign(
        {
          sub: `app:${auth.app.id}`,
          kind: 'app',
          appId: auth.app.id,
          appCode: auth.app.code,
          secretId: auth.secret.id
        },
        {
          expiresIn: '12h'
        }
      ),
      expiresIn: 12 * 60 * 60,
      app: {
        id: auth.app.id,
        code: auth.app.code,
        name: auth.app.name,
        type: auth.app.type
      }
    };
  });

  app.get(
    '/v1/apps/:appCode/authorizations/me',
    {
      preHandler: [app.authenticateApp, app.authenticate],
      config: {
        rateLimit: {
          hook: 'preHandler',
          max: 120,
          timeWindow: '1 minute',
          keyGenerator: (request: Parameters<typeof buildAppCodeUserRateLimitKey>[0]) =>
            buildAppCodeUserRateLimitKey(request, 'app-authorizations-me')
        }
      }
    },
    async (request) => {
      const params = appCodeParamsSchema.parse(request.params);
      return new AppService(app.db).listUserAuthorizationsForApp(params.appCode, request.user.sub);
    }
  );

  app.get('/v1/admin/apps', { preHandler: app.requireAdmin }, async () => {
    return {
      items: await new AppService(app.db).listManagedApps()
    };
  });

  app.get('/v1/admin/apps/:appCode', { preHandler: app.requireAdmin }, async (request) => {
    const params = appCodeParamsSchema.parse(request.params);
    return new AppService(app.db).getManagedApp(params.appCode);
  });

  app.put('/v1/admin/apps/:appCode', { preHandler: app.requireAdmin }, async (request) => {
    const params = appCodeParamsSchema.parse(request.params);
    const payload = upsertAppSchema.parse(request.body);

    return new AppService(app.db).upsertApp(params.appCode, payload, request.user.sub);
  });

  app.post('/v1/admin/apps/:appCode/secrets', { preHandler: app.requireAdmin }, async (request, reply) => {
    const params = appCodeParamsSchema.parse(request.params);
    const payload = createAppSecretSchema.parse(request.body);
    const result = await new AppService(app.db).issueSecret(params.appCode, payload, request.user.sub);

    return reply.status(201).send(result);
  });

  app.post('/v1/admin/apps/:appCode/secrets/:secretId/revoke', { preHandler: app.requireAdmin }, async (request) => {
    const params = appSecretParamsSchema.parse(request.params);
    return new AppService(app.db).revokeSecret(params.appCode, params.secretId, request.user.sub);
  });

  app.post('/v1/admin/apps/:appCode/delivery-manifest/sync', { preHandler: app.requireAdmin }, async (request) => {
    const params = appCodeParamsSchema.parse(request.params);
    const payload = syncDeliveryManifestSchema.parse(request.body);
    return new AppService(app.db).syncDeliveryManifest(params.appCode, payload, request.user.sub);
  });
};
