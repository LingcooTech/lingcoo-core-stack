import { hostingServiceRoutes } from './hosting-service-routes';
import { adminDeploymentRoutes } from './admin-ledger';
import { hostingOperationRoutes } from './hosting-operation-routes';
import type { FastifyPluginAsync } from 'fastify';
import { domainRoutes } from './domain-routes';
import { hostingRoutes } from './hosting-routes';

import {
  completeDeploymentActionSchema,
  createDeploymentSchema,
  deploymentParamsSchema,
  exchangeDeploymentTokenSchema,
  issueDeploymentTokenSchema,
  pullDeploymentActionSchema,
  requestDeploymentActionSchema,
  reportDeploymentStatusSchema,
  updateDeploymentSchema,
} from './schemas';

export const deploymentRoutes: FastifyPluginAsync = async (app) => {
  await app.register(adminDeploymentRoutes);
  await app.register(hostingServiceRoutes);
  await app.register(hostingRoutes);
  await app.register(hostingOperationRoutes);
  await app.register(domainRoutes);
  app.get('/v1/deployments/me', { preHandler: app.authenticate }, async (request) => {
    return app.services.DeploymentService.listUserDeployments(request.user.sub);
  });

  app.post('/v1/deployments', { preHandler: app.requireEmailVerified }, async (request, reply) => {
    const payload = createDeploymentSchema.parse(request.body);
    const deployment = await app.services.DeploymentService.createDeployment({
      userId: request.user.sub,
      ...payload,
      commandId: request.idempotencyClaim?.id,
    });

    return reply.status(201).send(deployment);
  });

  app.patch(
    '/v1/deployments/:deploymentId',
    { preHandler: app.requireEmailVerified },
    async (request) => {
      const params = deploymentParamsSchema.parse(request.params);
      const payload = updateDeploymentSchema.parse(request.body);
      return app.services.DeploymentService.updateDeployment({
        deploymentId: params.deploymentId,
        userId: request.user.sub,
        ...payload,
      });
    },
  );

  app.post(
    '/v1/deployments/:deploymentId/tokens',
    { preHandler: app.authenticate },
    async (request) => {
      const params = deploymentParamsSchema.parse(request.params);
      const payload = issueDeploymentTokenSchema.parse(request.body);
      return app.services.DeploymentService.issueDeploymentToken({
        deploymentId: params.deploymentId,
        userId: request.user.sub,
        expiresInHours: payload.expiresInHours,
      });
    },
  );

  app.post(
    '/v1/deployments/:deploymentId/deactivate',
    { preHandler: app.authenticate },
    async (request) => {
      const params = deploymentParamsSchema.parse(request.params);
      return app.services.DeploymentService.deactivateDeployment({
        deploymentId: params.deploymentId,
        userId: request.user.sub,
      });
    },
  );

  app.post(
    '/v1/deployments/:deploymentId/actions',
    { preHandler: app.authenticate },
    async (request) => {
      const params = deploymentParamsSchema.parse(request.params);
      const payload = requestDeploymentActionSchema.parse(request.body);
      return app.services.DeploymentService.requestDeploymentAction({
        deploymentId: params.deploymentId,
        userId: request.user.sub,
        kind: payload.kind,
        commandId: request.idempotencyClaim?.id,
      });
    },
  );

  app.post('/v1/deployments/bootstrap/exchange', async (request) => {
    const payload = exchangeDeploymentTokenSchema.parse(request.body);
    return app.services.DeploymentService.exchangeBootstrapToken(payload.token);
  });

  app.post('/v1/deployments/actions/pull', async (request) => {
    const payload = pullDeploymentActionSchema.parse(request.body);
    return app.services.DeploymentService.pullDeploymentAction(payload);
  });

  app.post('/v1/deployments/status/report', async (request) => {
    const payload = reportDeploymentStatusSchema.parse(request.body);
    return app.services.DeploymentService.reportDeploymentStatus(payload);
  });

  app.post('/v1/deployments/actions/complete', async (request) => {
    const payload = completeDeploymentActionSchema.parse(request.body);
    return app.services.DeploymentService.completeDeploymentAction(payload);
  });
};
