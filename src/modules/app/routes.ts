import type { FastifyPluginAsync } from 'fastify';

import { buildAppCodeUserRateLimitKey } from '../../lib/rate-limit';
import {
  appCodeParamsSchema,
  appSecretParamsSchema,
  createAppSecretSchema,
  createAppSessionSchema,
  purgeAppConfigurationSchema,
  syncDeliveryManifestSchema,
  upsertAppSchema,
} from './schemas';

export const appRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/v1/admin/apps/:appCode/readiness',
    { preHandler: app.requirePermission('apps.manage') },
    async (request) =>
      app.services.AppService.releaseReadiness(appCodeParamsSchema.parse(request.params).appCode),
  );
  app.get('/v1/apps', async () => {
    return {
      items: await app.services.AppService.listActiveApps(),
    };
  });

  app.get('/v1/apps/:appCode', async (request) => {
    const params = appCodeParamsSchema.parse(request.params);
    return app.services.AppService.getPublicApp(params.appCode);
  });

  app.get('/v1/apps/:appCode/catalog', async (request) => {
    const params = appCodeParamsSchema.parse(request.params);
    return app.services.AppService.getAppCatalog(params.appCode);
  });

  app.post('/v1/apps/:appCode/session', async (request) => {
    const params = appCodeParamsSchema.parse(request.params);
    const payload = createAppSessionSchema.parse(request.body);
    const auth = await app.services.AppService.authenticateAppSecret(
      params.appCode,
      payload.appSecret,
    );

    return {
      token: app.jwt.sign(
        {
          sub: `app:${auth.app.id}`,
          kind: 'app',
          appId: auth.app.id,
          appCode: auth.app.code,
          secretId: auth.secret.id,
        },
        {
          expiresIn: '12h',
        },
      ),
      expiresIn: 12 * 60 * 60,
      app: {
        id: auth.app.id,
        code: auth.app.code,
        name: auth.app.name,
        type: auth.app.type,
      },
    };
  });

  app.get(
    '/v1/apps/:appCode/entitlements/me',
    {
      preHandler: [app.authenticateApp, app.authenticate],
      config: {
        rateLimit: {
          hook: 'preHandler',
          max: 120,
          timeWindow: '1 minute',
          keyGenerator: (request: Parameters<typeof buildAppCodeUserRateLimitKey>[0]) =>
            buildAppCodeUserRateLimitKey(request, 'app-entitlements-me'),
        },
      },
    },
    async (request) => {
      const params = appCodeParamsSchema.parse(request.params);
      return app.services.AppService.listUserEntitlementsForApp(params.appCode, request.user.sub);
    },
  );

  app.get('/v1/admin/apps', { preHandler: app.requirePermission('apps.manage') }, async () => {
    return {
      items: await app.services.AppService.listManagedApps(),
    };
  });

  app.put(
    '/v1/admin/apps/:appCode',
    { preHandler: app.requirePermission('apps.manage') },
    async (request) => {
      const params = appCodeParamsSchema.parse(request.params);
      const payload = upsertAppSchema.parse(request.body);

      return app.services.AppService.upsertApp(params.appCode, payload, request.user.sub);
    },
  );

  app.post(
    '/v1/admin/apps/:appCode/archive',
    { preHandler: app.requirePermission('apps.manage') },
    async (request) => {
      const params = appCodeParamsSchema.parse(request.params);
      return app.services.AppService.archiveApp(params.appCode, request.user.sub);
    },
  );

  app.post(
    '/v1/admin/apps/:appCode/purge-config',
    { preHandler: app.requirePermission('apps.manage') },
    async (request) => {
      const params = appCodeParamsSchema.parse(request.params);
      const payload = purgeAppConfigurationSchema.parse(request.body);

      return app.services.AppService.purgeAppConfiguration(
        params.appCode,
        payload.confirmAppCode,
        request.user.sub,
      );
    },
  );

  app.post(
    '/v1/admin/apps/:appCode/delivery-manifest/sync',
    { preHandler: app.requirePermission('apps.manage') },
    async (request) => {
      const params = appCodeParamsSchema.parse(request.params);
      const payload = syncDeliveryManifestSchema.parse(request.body ?? {});

      return app.services.AppService.syncDeliveryManifest(
        params.appCode,
        payload,
        request.user.sub,
      );
    },
  );

  app.post(
    '/v1/admin/apps/:appCode/secrets',
    { preHandler: app.requirePermission('apps.manage') },
    async (request, reply) => {
      const params = appCodeParamsSchema.parse(request.params);
      const payload = createAppSecretSchema.parse(request.body);
      const result = await app.services.AppService.issueSecret(
        params.appCode,
        payload,
        request.user.sub,
      );

      return reply.status(201).send(result);
    },
  );

  app.post(
    '/v1/admin/apps/:appCode/secrets/:secretId/revoke',
    { preHandler: app.requirePermission('apps.manage') },
    async (request) => {
      const params = appSecretParamsSchema.parse(request.params);
      return app.services.AppService.revokeSecret(
        params.appCode,
        params.secretId,
        request.user.sub,
      );
    },
  );
};
