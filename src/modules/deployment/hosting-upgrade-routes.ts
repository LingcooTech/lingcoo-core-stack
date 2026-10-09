import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { deploymentParamsSchema, upgradeRequestSchema } from '@lingcoo/contracts';
import { HostingUpgradeService } from './hosting-upgrade';
import { AuditLogService } from '../../lib/audit-logs';
export const hostingUpgradeRoutes: FastifyPluginAsync = async (app) => {
  const path = '/v1/admin/deployments/:deploymentId/upgrades';
  app.get(path, { preHandler: app.requirePermission('deployments.view') }, (request) =>
    new HostingUpgradeService(app.db).read(
      deploymentParamsSchema.parse(request.params).deploymentId,
    ),
  );
  app.post(
    path,
    { preHandler: app.requirePermission('settings.manage') },
    async (request, reply) => {
      const id = deploymentParamsSchema.parse(request.params).deploymentId;
      const input = upgradeRequestSchema.parse(request.body);
      const result = await app.db.transaction(async (tx) => {
        const result = await new HostingUpgradeService(tx).request(id, request.user.sub, input);
        await new AuditLogService(tx).record({
          actorType: 'user',
          actorUserId: request.user.sub,
          action: 'hosting.upgrade_requested',
          resourceType: 'hosting_operation',
          resourceId: result.operationId,
          summary: '请求受控镜像升级；包含停服备份和失败回退',
          requestId: request.id,
        });
        return result;
      });
      return reply.status(202).send(result);
    },
  );
  app.get('/v1/hosting/nodes/:nodeId/operations/:operationId/upgrade', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const p = z.object({ nodeId: z.uuid(), operationId: z.uuid() }).parse(request.params);
    return new HostingUpgradeService(app.db).nodePlan(
      p.nodeId,
      (request.headers.authorization ?? '').replace(/^Bearer /, ''),
      p.operationId,
    );
  });
};
