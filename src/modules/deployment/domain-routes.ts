import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addDeploymentDomainSchema } from '@lingcoo/contracts';
import { CustomDomainService } from './custom-domains';
import { HostingRepository } from './hosting';
const params = z.object({
  deploymentId: z.uuid(),
  domainId: z.uuid().optional(),
  nodeId: z.uuid().optional(),
});
export const domainRoutes: FastifyPluginAsync = async (app) => {
  const service = new CustomDomainService(app.db, app.appEnv);
  app.get('/v1/deployments/:deploymentId/domains', { preHandler: app.authenticate }, (request) => {
    const p = params.parse(request.params);
    return service.list(p.deploymentId, request.user.sub);
  });
  app.post(
    '/v1/deployments/:deploymentId/domains',
    { preHandler: app.requireEmailVerified },
    async (request, reply) => {
      const p = params.parse(request.params);
      const body = addDeploymentDomainSchema.parse(request.body);
      return reply
        .status(201)
        .send(await service.add(p.deploymentId, request.user.sub, body.hostname));
    },
  );
  app.post(
    '/v1/deployments/:deploymentId/domains/:domainId/verify',
    {
      preHandler: app.requireEmailVerified,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    (request) => {
      const p = params.parse(request.params);
      return service.verify(p.deploymentId, request.user.sub, p.domainId!);
    },
  );
  app.delete(
    '/v1/deployments/:deploymentId/domains/:domainId',
    { preHandler: app.requireEmailVerified },
    (request) => {
      const p = params.parse(request.params);
      return service.remove(p.deploymentId, request.user.sub, p.domainId!);
    },
  );
  app.post('/v1/hosting/nodes/:nodeId/ingress/:deploymentId/domains/:domainId', async (request) => {
    const p = params.parse(request.params);
    const node = await new HostingRepository(app.db).authenticate(
      p.nodeId!,
      (request.headers.authorization ?? '').replace(/^Bearer /, ''),
    );
    if (!node.enabled) return { ok: false };
    const body = z
      .object({ removed: z.boolean().default(false) })
      .strict()
      .parse(request.body ?? {});
    return service.nodeComplete(p.nodeId!, p.deploymentId, p.domainId!, body.removed);
  });
};
