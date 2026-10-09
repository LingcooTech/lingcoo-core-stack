import type { FastifyPluginAsync } from 'fastify';
import {
  hostingNodeParamsSchema,
  hostingOperationRequestSchema,
  hostingOperationCompletionSchema,
  deploymentParamsSchema,
} from '@lingcoo/contracts';
import { HostingOperations } from './hosting-operations';
import { AuditLogService } from '../../lib/audit-logs';
export const hostingOperationRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/v1/admin/hosting/overview',
    { preHandler: app.requirePermission('settings.manage') },
    () => new HostingOperations(app.db).overview(),
  );
  app.post(
    '/v1/admin/hosting/instances/:deploymentId/operations',
    { preHandler: app.requirePermission('settings.manage') },
    async (request, reply) => {
      const { deploymentId } = deploymentParamsSchema.parse(request.params);
      const input = hostingOperationRequestSchema.parse(request.body);
      const result = await app.db.transaction(async (tx) => {
        const op = await new HostingOperations(tx).request(deploymentId, request.user.sub, input);
        await new AuditLogService(tx).record({
          actorType: 'user',
          actorUserId: request.user.sub,
          action: 'hosting.operation_requested',
          resourceType: 'hosting_operation',
          resourceId: op.id,
          summary: input.kind === 'restart' ? '请求重启托管应用' : '请求备份托管应用',
          requestId: request.id,
        });
        return op;
      });
      return reply.status(202).send(result);
    },
  );
  app.post(
    '/v1/hosting/nodes/:nodeId/operations/claim',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { nodeId } = hostingNodeParamsSchema.parse(request.params);
      return app.db.transaction((tx) =>
        new HostingOperations(tx).claim(
          nodeId,
          (request.headers.authorization ?? '').replace(/^Bearer /, ''),
        ),
      );
    },
  );
  app.post(
    '/v1/hosting/nodes/:nodeId/operations/complete',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { nodeId } = hostingNodeParamsSchema.parse(request.params),
        payload = hostingOperationCompletionSchema.parse(request.body);
      return app.db.transaction(async (tx) => {
        const result = await new HostingOperations(tx).complete(
          nodeId,
          (request.headers.authorization ?? '').replace(/^Bearer /, ''),
          payload.operationId,
          payload.success,
          new Date(),
          payload.evidence,
        );
        await new AuditLogService(tx).record({
          actorType: 'system',
          action: 'hosting.operation_completed',
          resourceType: 'hosting_operation',
          resourceId: payload.operationId,
          summary: payload.success ? '节点确认运维完成' : '节点报告运维失败',
          requestId: request.id,
        });
        return result;
      });
    },
  );
};
