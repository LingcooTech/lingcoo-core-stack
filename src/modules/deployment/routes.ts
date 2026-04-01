import type { FastifyPluginAsync } from 'fastify';

import { DeploymentService } from './service';
import { createDeploymentSchema, deploymentParamsSchema, exchangeDeploymentTokenSchema, issueDeploymentTokenSchema } from './schemas';

export const deploymentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/deployments/me', { preHandler: app.authenticate }, async (request) => {
    return new DeploymentService(app.db, app.appEnv).listUserDeployments(request.user.sub);
  });

  app.post('/v1/deployments', { preHandler: app.authenticate }, async (request, reply) => {
    const payload = createDeploymentSchema.parse(request.body);
    const deployment = await new DeploymentService(app.db, app.appEnv).createDeployment({
      userId: request.user.sub,
      ...payload
    });

    return reply.status(201).send(deployment);
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

  app.post('/v1/deployments/bootstrap/exchange', async (request) => {
    const payload = exchangeDeploymentTokenSchema.parse(request.body);
    return new DeploymentService(app.db, app.appEnv).exchangeBootstrapToken(payload.token);
  });
};
