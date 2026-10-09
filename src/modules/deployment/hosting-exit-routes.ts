import type { FastifyPluginAsync } from 'fastify';
import { deploymentParamsSchema, hostingExitCommandSchema } from '@lingcoo/contracts';
import { HostingExitService } from './hosting-exit';
export const hostingExitRoutes: FastifyPluginAsync = async (app) => {
  for (const admin of [false, true]) {
    const path = admin
      ? '/v1/admin/deployments/:deploymentId/hosting-exit'
      : '/v1/deployments/:deploymentId/hosting-exit';
    app.get(
      path,
      { preHandler: admin ? app.requirePermission('deployments.view') : app.authenticate },
      async (request) =>
        new HostingExitService(app.db).read(
          deploymentParamsSchema.parse(request.params).deploymentId,
          admin ? undefined : request.user.sub,
        ),
    );
    app.post(
      path,
      { preHandler: admin ? app.requirePermission('settings.manage') : app.authenticate },
      async (request) =>
        new HostingExitService(app.db).command(
          deploymentParamsSchema.parse(request.params).deploymentId,
          request.user.sub,
          hostingExitCommandSchema.parse(request.body),
          admin,
        ),
    );
  }
};
