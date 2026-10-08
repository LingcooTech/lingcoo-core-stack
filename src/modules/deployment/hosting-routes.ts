import { HostingDnsService } from './hosting-dns';
import type { FastifyPluginAsync } from 'fastify';
import {
  hostingCompletionSchema,
  createHostingNodeSchema,
  hostingNodeParamsSchema,
  hostingNodeReportSchema,
  hostingNodeStateSchema,
} from '@lingcoo/contracts';
import { HostingRepository } from './hosting';
import { deploymentParamsSchema } from './schemas';
import { AuditLogService } from '../../lib/audit-logs';

export const hostingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/hosting/nodes/:nodeId/ingress', async (request) => {
    const { nodeId } = hostingNodeParamsSchema.parse(request.params);
    const node = await new HostingRepository(app.db).authenticate(
      nodeId,
      (request.headers.authorization ?? '').replace(/^Bearer /, ''),
    );
    return {
      items: await new HostingDnsService(app.db, app.appEnv).listIngress(node.id),
    };
  });
  app.post('/v1/hosting/nodes/:nodeId/ingress/:deploymentId', async (request) => {
    const { nodeId } = hostingNodeParamsSchema.parse(request.params);
    const { deploymentId } = deploymentParamsSchema.parse(request.params);
    await new HostingRepository(app.db).authenticate(
      nodeId,
      (request.headers.authorization ?? '').replace(/^Bearer /, ''),
    );
    return new HostingDnsService(app.db, app.appEnv).verifyIngress(nodeId, deploymentId);
  });

  app.post(
    '/v1/hosting/nodes/:nodeId/claim',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { nodeId } = hostingNodeParamsSchema.parse(request.params);
      return app.services.DeploymentService.claimHostingJob({
        nodeId,
        token: (request.headers.authorization ?? '').replace(/^Bearer /, ''),
      });
    },
  );
  app.post(
    '/v1/hosting/nodes/:nodeId/complete',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { nodeId } = hostingNodeParamsSchema.parse(request.params);
      return app.services.DeploymentService.completeHostingJob({
        nodeId,
        token: (request.headers.authorization ?? '').replace(/^Bearer /, ''),
        ...hostingCompletionSchema.parse(request.body),
      });
    },
  );

  app.get('/v1/deployments/options', { preHandler: app.authenticate }, async () => ({
    modes: ['self_hosted', 'managed'],
    managedDomainSuffix: app.appEnv.HOSTING_DOMAIN_SUFFIX,
  }));
  app.post(
    '/v1/deployments/:deploymentId/allocate',
    { preHandler: app.requireEmailVerified },
    async (request) => {
      const { deploymentId } = deploymentParamsSchema.parse(request.params);
      return app.services.DeploymentService.retryManagedAllocation({
        deploymentId,
        userId: request.user.sub,
      });
    },
  );
  app.get(
    '/v1/admin/hosting/nodes',
    { preHandler: app.requirePermission('settings.manage') },
    async () => {
      return new HostingRepository(app.db).nodeViews(new Date());
    },
  );
  app.post(
    '/v1/admin/hosting/nodes',
    { preHandler: app.requirePermission('settings.manage') },
    async (request, reply) => {
      const payload = createHostingNodeSchema.parse(request.body);
      const created = await app.db.transaction(async (tx) => {
        const node = await new HostingRepository(tx).createNode(payload, new Date());
        await new AuditLogService(tx).record({
          actorType: 'user',
          actorUserId: request.user.sub,
          action: 'hosting.node_created',
          resourceType: 'hosting_node',
          resourceId: node.node.id,
          summary: '登记托管节点',
          requestId: request.id,
        });
        return node;
      });
      return reply.status(201).send(created);
    },
  );
  app.patch(
    '/v1/admin/hosting/nodes/:nodeId',
    { preHandler: app.requirePermission('settings.manage') },
    async (request) => {
      const { nodeId } = hostingNodeParamsSchema.parse(request.params);
      const payload = hostingNodeStateSchema.parse(request.body);
      await app.db.transaction(async (tx) => {
        const repository = new HostingRepository(tx);
        await repository.lockPool();
        await repository.updateNode(nodeId, payload);
        await new AuditLogService(tx).record({
          actorType: 'user',
          actorUserId: request.user.sub,
          action: 'hosting.node_state_changed',
          resourceType: 'hosting_node',
          resourceId: nodeId,
          summary: '更新节点资产或分配配置',
          requestId: request.id,
        });
      });
      await app.services.DeploymentService.refreshManagedAllocations();
      return { ok: true };
    },
  );
  app.post(
    '/v1/hosting/nodes/:nodeId/report',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { nodeId } = hostingNodeParamsSchema.parse(request.params);
      const payload = hostingNodeReportSchema.parse(request.body);
      const token = (request.headers.authorization ?? '').replace(/^Bearer /, '');
      await app.db.transaction(async (tx) => {
        const repository = new HostingRepository(tx);
        await repository.lockPool();
        await repository.report(nodeId, token, payload, new Date());
      });
      await app.services.DeploymentService.refreshManagedAllocations();
      return { ok: true };
    },
  );
};
