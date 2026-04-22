import type { FastifyPluginAsync } from 'fastify';

import { DeploymentService } from './service';
import {
  completeDeploymentActionSchema,
  createDeploymentSchema,
  deploymentParamsSchema,
  exchangeDeploymentTokenSchema,
  issueDeploymentTokenSchema,
  pullDeploymentActionSchema,
  requestDeploymentActionSchema,
  reportDeploymentStatusSchema,
  updateDeploymentSchema
} from './schemas';

export const deploymentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/deployments/me', { preHandler: app.authenticate }, async (request) => {
    return new DeploymentService(app.db, app.appEnv).listUserDeployments(request.user.sub);
  });

  app.post('/v1/deployments', { preHandler: app.requireEmailVerified }, async (request, reply) => {
    const payload = createDeploymentSchema.parse(request.body);
    const deployment = await new DeploymentService(app.db, app.appEnv).createDeployment({
      userId: request.user.sub,
      ...payload
    });

    return reply.status(201).send(deployment);
  });

  app.patch('/v1/deployments/:deploymentId', { preHandler: app.requireEmailVerified }, async (request) => {
    const params = deploymentParamsSchema.parse(request.params);
    const payload = updateDeploymentSchema.parse(request.body);
    return new DeploymentService(app.db, app.appEnv).updateDeployment({
      deploymentId: params.deploymentId,
      userId: request.user.sub,
      ...payload
    });
  });

  app.post('/v1/deployments/:deploymentId/tokens', { preHandler: app.authenticate }, async (request) => {
    const params = deploymentParamsSchema.parse(request.params);
    const payload = issueDeploymentTokenSchema.parse(request.body);
    return new DeploymentService(app.db, app.appEnv).issueDeploymentToken({
      deploymentId: params.deploymentId,
      userId: request.user.sub,
      expiresInHours: payload.expiresInHours
    });
  });

  app.post('/v1/deployments/:deploymentId/deactivate', { preHandler: app.authenticate }, async (request) => {
    const params = deploymentParamsSchema.parse(request.params);
    return new DeploymentService(app.db, app.appEnv).deactivateDeployment({
      deploymentId: params.deploymentId,
      userId: request.user.sub
    });
  });

  app.post('/v1/deployments/:deploymentId/actions', { preHandler: app.authenticate }, async (request) => {
    const params = deploymentParamsSchema.parse(request.params);
    const payload = requestDeploymentActionSchema.parse(request.body);
    return new DeploymentService(app.db, app.appEnv).requestDeploymentAction({
      deploymentId: params.deploymentId,
      userId: request.user.sub,
      kind: payload.kind
    });
  });

  app.post('/v1/deployments/bootstrap/exchange', async (request) => {
    const payload = exchangeDeploymentTokenSchema.parse(request.body);
    return new DeploymentService(app.db, app.appEnv).exchangeBootstrapToken(payload.token);
  });

  app.post('/v1/deployments/actions/pull', async (request) => {
    const payload = pullDeploymentActionSchema.parse(request.body);
    return new DeploymentService(app.db, app.appEnv).pullDeploymentAction(payload);
  });

  app.post('/v1/deployments/status/report', async (request) => {
    const payload = reportDeploymentStatusSchema.parse(request.body);
    return new DeploymentService(app.db, app.appEnv).reportDeploymentStatus(payload);
  });

  app.post('/v1/deployments/actions/complete', async (request) => {
    const payload = completeDeploymentActionSchema.parse(request.body);
    return new DeploymentService(app.db, app.appEnv).completeDeploymentAction(payload);
  });
};
