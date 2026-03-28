import type { FastifyPluginAsync } from 'fastify';

import { appCodeParamsSchema, createAppSecretSchema, upsertAppSchema } from './schemas';
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

  app.get('/v1/apps/:appCode/entitlements/me', { preHandler: app.authenticate }, async (request) => {
    const params = appCodeParamsSchema.parse(request.params);
    return new AppService(app.db).listUserEntitlementsForApp(params.appCode, request.user.sub);
  });

  app.get('/v1/admin/apps', { preHandler: app.requireAdmin }, async () => {
    return {
      items: await new AppService(app.db).listManagedApps()
    };
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
};
