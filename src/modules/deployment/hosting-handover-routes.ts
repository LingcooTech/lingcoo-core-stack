import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { deploymentParamsSchema, handoverCommandSchema } from '@lingcoo/contracts';
import { HostingHandoverService } from './hosting-handover';
export const hostingHandoverRoutes: FastifyPluginAsync = async (app) => {
  const service = () => new HostingHandoverService(app.db, app.appEnv);
  for (const admin of [false, true]) {
    const path = `/v1/${admin ? 'admin/' : ''}deployments/:deploymentId/handover`;
    app.get(
      path,
      { preHandler: admin ? app.requirePermission('deployments.view') : app.authenticate },
      async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        return service().read(
          deploymentParamsSchema.parse(request.params).deploymentId,
          admin ? undefined : request.user.sub,
        );
      },
    );
    app.post(
      path,
      { preHandler: admin ? app.requirePermission('settings.manage') : app.authenticate },
      async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        await service().cleanup();
        return service().command(
          deploymentParamsSchema.parse(request.params).deploymentId,
          request.user.sub,
          handoverCommandSchema.parse(request.body),
          admin,
        );
      },
    );
  }
  app.get(
    '/v1/deployments/:deploymentId/handover/:handoverId/download/:grantId',
    {
      preHandler: app.authenticate,
      exposeHeadRoute: false,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const p = z
        .object({ deploymentId: z.uuid(), handoverId: z.uuid(), grantId: z.uuid() })
        .parse(request.params);
      const result = await service().download(
        p.deploymentId,
        p.handoverId,
        p.grantId,
        request.user.sub,
      );
      return reply
        .header('Cache-Control', 'no-store')
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${p.handoverId}.tar.age"`)
        .header('Content-Length', result.size)
        .header('X-Content-SHA256', result.sha256)
        .send(result.stream);
    },
  );
  const path = '/v1/hosting/nodes/:nodeId/operations/:operationId/data';
  const params = z.object({ nodeId: z.uuid(), operationId: z.uuid() });
  app.get(path, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const p = params.parse(request.params);
    return service().nodeRead(
      p.nodeId,
      (request.headers.authorization ?? '').replace(/^Bearer /, ''),
      p.operationId,
    );
  });
  app.post(
    path,
    { bodyLimit: 1500000, config: { rateLimit: { max: 600, timeWindow: '1 minute' } } },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const p = params.parse(request.params);
      return service().upload(
        p.nodeId,
        (request.headers.authorization ?? '').replace(/^Bearer /, ''),
        p.operationId,
        request.body,
      );
    },
  );
  // API owns the mounted transfer volume. Revoke first; unlink is restart-safe and retryable.
  const timer = setInterval(() => {
    void service()
      .cleanup()
      .catch(() => app.log.error('Hosting handover cleanup failed'));
  }, 15 * 60000);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
};
