import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  applicationImportSchema,
  applicationPreviewSchema,
  applicationConnectionInputSchema,
  applicationReleaseInputSchema,
  buildRequestInputSchema,
} from '@lingcoo/contracts';

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
  const managed = { preHandler: app.requirePermission('apps.manage') };
  app.put('/v1/admin/apps/:appCode/source', managed, (r) =>
    app.services.AppService.lifecycle()
      .publishing()
      .applySource(
        appCodeParamsSchema.parse(r.params).appCode,
        applicationPreviewSchema.parse(r.body),
        r.user.sub,
      ),
  );
  app.get('/v1/admin/apps/:appCode/builds', managed, (r) =>
    app.services.AppService.lifecycle()
      .publishing()
      .builds(appCodeParamsSchema.parse(r.params).appCode),
  );
  app.post('/v1/admin/apps/:appCode/builds', managed, (r) =>
    app.services.AppService.lifecycle()
      .publishing()
      .dispatch(
        appCodeParamsSchema.parse(r.params).appCode,
        buildRequestInputSchema.parse(r.body),
        r.user.sub,
      ),
  );
  app.get('/v1/admin/apps/:appCode/publishing-tokens', managed, (r) =>
    app.services.AppService.lifecycle()
      .publishing()
      .tokens(appCodeParamsSchema.parse(r.params).appCode),
  );
  app.post('/v1/admin/apps/:appCode/publishing-tokens', managed, (r) =>
    app.services.AppService.lifecycle()
      .publishing()
      .issueToken(
        appCodeParamsSchema.parse(r.params).appCode,
        z.object({ name: z.string().trim().min(1).max(120) }).parse(r.body).name,
        r.user.sub,
      ),
  );
  app.delete('/v1/admin/apps/:appCode/publishing-tokens/:tokenId', managed, (r) => {
    const p = appCodeParamsSchema.extend({ tokenId: z.uuid() }).parse(r.params);
    return app.services.AppService.lifecycle()
      .publishing()
      .revokeToken(p.appCode, p.tokenId, r.user.sub);
  });
  app.post(
    '/v1/publishing/apps/:appCode/releases',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    (r) =>
      app.services.AppService.lifecycle()
        .publishing()
        .submit(
          appCodeParamsSchema.parse(r.params).appCode,
          (r.headers.authorization ?? '').replace(/^Bearer /, ''),
          applicationReleaseInputSchema.parse(r.body),
        ),
  );
  app.get('/v1/admin/app-connections', managed, () =>
    app.services.AppService.lifecycle().connections(),
  );
  app.post('/v1/admin/app-connections', managed, (r) =>
    app.services.AppService.lifecycle().connect(
      applicationConnectionInputSchema.parse(r.body),
      r.user.sub,
    ),
  );
  app.delete('/v1/admin/app-connections/:connectionId', managed, (r) =>
    app.services.AppService.lifecycle().disconnect(
      z.object({ connectionId: z.uuid() }).parse(r.params).connectionId,
      r.user.sub,
    ),
  );
  app.post('/v1/admin/apps/import/preview', managed, (r) =>
    app.services.AppService.lifecycle().preview(applicationImportSchema.parse(r.body)),
  );
  app.post('/v1/admin/apps/import', managed, (r) =>
    app.services.AppService.lifecycle().import(applicationPreviewSchema.parse(r.body), r.user.sub),
  );
  app.get('/v1/admin/apps/:appCode/lifecycle', managed, (r) =>
    app.services.AppService.lifecycle().overview(appCodeParamsSchema.parse(r.params).appCode),
  );
  app.post('/v1/admin/apps/:appCode/releases', managed, (r) =>
    app.services.AppService.lifecycle().registerRelease(
      appCodeParamsSchema.parse(r.params).appCode,
      applicationReleaseInputSchema.parse(r.body),
      r.user.sub,
    ),
  );
  app.post('/v1/admin/apps/:appCode/releases/:releaseId/publish', managed, (r) => {
    const params = appCodeParamsSchema.extend({ releaseId: z.uuid() }).parse(r.params);
    return app.services.AppService.lifecycle().transition(
      params.appCode,
      params.releaseId,
      'published',
      r.user.sub,
    );
  });
  app.post('/v1/admin/apps/:appCode/releases/:releaseId/withdraw', managed, (r) => {
    const params = appCodeParamsSchema.extend({ releaseId: z.uuid() }).parse(r.params);
    return app.services.AppService.lifecycle().transition(
      params.appCode,
      params.releaseId,
      'withdrawn',
      r.user.sub,
    );
  });
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
