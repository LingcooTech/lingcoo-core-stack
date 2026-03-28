import type { FastifyPluginAsync } from 'fastify';

import { createInstallSchema, installHeartbeatSchema, installParamsSchema } from './schemas';
import { InstallService } from './service';

export const installRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/apps/:appCode/installs', { preHandler: app.authenticateApp }, async (request, reply) => {
    const params = installParamsSchema.pick({ appCode: true }).parse(request.params);
    const payload = createInstallSchema.parse(request.body);
    const result = await new InstallService(app.db).registerInstall({
      appCode: params.appCode,
      ...payload
    });

    return reply.status(201).send(result);
  });

  app.post(
    '/v1/apps/:appCode/installs/:installId/bind',
    { preHandler: [app.authenticateApp, app.authenticate] },
    async (request) => {
    const params = installParamsSchema.parse(request.params);
    return new InstallService(app.db).bindInstall({
      appCode: params.appCode,
      installId: params.installId,
      userId: request.user.sub
    });
    }
  );

  app.post('/v1/apps/:appCode/installs/:installId/heartbeat', { preHandler: app.authenticateApp }, async (request) => {
    const params = installParamsSchema.parse(request.params);
    const payload = installHeartbeatSchema.parse(request.body);

    return new InstallService(app.db).heartbeat({
      appCode: params.appCode,
      installId: params.installId,
      ...payload
    });
  });

  app.get(
    '/v1/apps/:appCode/installs/:installId/license',
    { preHandler: [app.authenticateApp, app.authenticate] },
    async (request) => {
      const params = installParamsSchema.parse(request.params);
      return new InstallService(app.db).getInstallLicense({
        appCode: params.appCode,
        installId: params.installId,
        userId: request.user.sub
      });
    }
  );
};
