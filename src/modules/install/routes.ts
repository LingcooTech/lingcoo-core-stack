import type { FastifyPluginAsync } from 'fastify';

import { createInstallSchema, installHeartbeatSchema, installParamsSchema } from './schemas';

export const installRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/v1/apps/:appCode/installs',
    { preHandler: app.authenticateApp },
    async (request, reply) => {
      const params = installParamsSchema.pick({ appCode: true }).parse(request.params);
      const payload = createInstallSchema.parse(request.body);
      const result = await app.services.InstallService.registerInstall({
        appCode: params.appCode,
        ...payload,
      });

      return reply.status(201).send(result);
    },
  );

  app.post(
    '/v1/apps/:appCode/installs/:installId/bind',
    { preHandler: [app.authenticateApp, app.authenticate] },
    async (request) => {
      const params = installParamsSchema.parse(request.params);
      return app.services.InstallService.bindInstall({
        appCode: params.appCode,
        installId: params.installId,
        userId: request.user.sub,
      });
    },
  );

  app.post(
    '/v1/apps/:appCode/installs/:installId/heartbeat',
    { preHandler: app.authenticateApp },
    async (request) => {
      const params = installParamsSchema.parse(request.params);
      const payload = installHeartbeatSchema.parse(request.body);

      return app.services.InstallService.heartbeat({
        appCode: params.appCode,
        installId: params.installId,
        ...payload,
      });
    },
  );

  app.get(
    '/v1/apps/:appCode/installs/:installId/license',
    { preHandler: [app.authenticateApp, app.authenticate] },
    async (request) => {
      const params = installParamsSchema.parse(request.params);
      return app.services.InstallService.getInstallLicense({
        appCode: params.appCode,
        installId: params.installId,
        userId: request.user.sub,
      });
    },
  );
};
