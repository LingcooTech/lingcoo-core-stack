import type { FastifyPluginAsync } from 'fastify';
import { deploymentParamsSchema, hostingServiceCommandSchema } from '@lingcoo/contracts';
import { HostingServiceTerms } from './hosting-service';

export const hostingServiceRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/v1/deployments/:deploymentId/hosting-service',
    { preHandler: app.authenticate },
    async (request) => {
      const { deploymentId } = deploymentParamsSchema.parse(request.params);
      return new HostingServiceTerms(app.db).read(deploymentId, request.user.sub);
    },
  );
  app.get(
    '/v1/admin/deployments/:deploymentId/hosting-service',
    { preHandler: app.requirePermission('deployments.view') },
    async (request) => {
      const { deploymentId } = deploymentParamsSchema.parse(request.params);
      return new HostingServiceTerms(app.db).adminRead(deploymentId);
    },
  );
  app.post(
    '/v1/admin/deployments/:deploymentId/hosting-service',
    { preHandler: app.requirePermission('hosting.terms.manage') },
    async (request) => {
      const { deploymentId } = deploymentParamsSchema.parse(request.params);
      return new HostingServiceTerms(app.db).command(
        deploymentId,
        request.user.sub,
        hostingServiceCommandSchema.parse(request.body),
      );
    },
  );
};
