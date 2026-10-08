import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ItemRefundCommandSchema } from '@lingcoo/contracts';
const params = z.object({ orderNo: z.string().min(1).max(64) });
export const itemRefundRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/v1/billing/orders/:orderNo/item-refunds',
    { preHandler: app.authenticate },
    async (request) =>
      app.services.BillingService.itemRefundLedger(
        params.parse(request.params).orderNo,
        request.user.sub,
      ),
  );
  app.get(
    '/v1/admin/billing/orders/:orderNo/item-refunds',
    { preHandler: app.requirePermission('orders.view') },
    async (request) =>
      app.services.BillingService.itemRefundLedger(params.parse(request.params).orderNo),
  );
  app.post(
    '/v1/admin/billing/orders/:orderNo/item-refunds',
    { preHandler: app.requirePermission('orders.refund') },
    async (request) =>
      app.services.BillingService.requestItemRefund(
        params.parse(request.params).orderNo,
        request.user.sub,
        ItemRefundCommandSchema.parse(request.body),
      ),
  );
  app.post(
    '/v1/admin/billing/orders/:orderNo/item-refunds/:refundId/reconcile',
    { preHandler: app.requirePermission('orders.refund') },
    async (request) => {
      const p = params.extend({ refundId: z.uuid() }).parse(request.params);
      return app.services.BillingService.reconcileItemRefund(p.orderNo, p.refundId);
    },
  );
};
