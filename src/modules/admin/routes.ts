import type { FastifyPluginAsync } from 'fastify';

import { PaymentSettingsService } from '../../lib/payment-settings';
import { AuthRepository } from '../auth/repository';
import { renderPaymentAdminPage } from './page';
import { AdminService } from './service';
import {
  adminListQuerySchema,
  adminOrderParamsSchema,
  alipayPaymentSettingsSchema,
  paymentProviderParamsSchema,
  wechatPaymentSettingsSchema
} from './schemas';

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/admin/payments', async (_request, reply) => {
    reply
      .type('text/html; charset=utf-8')
      .header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';"
      );

    return reply.send(renderPaymentAdminPage());
  });

  app.get('/v1/admin/bootstrap-status', async () => {
    return {
      hasAdmin: (await new AuthRepository(app.db).countAdmins()) > 0
    };
  });

  app.get('/v1/admin/payment-settings', { preHandler: app.requireAdmin }, async () => {
    return new PaymentSettingsService(app.db, app.appEnv).getOverview();
  });

  app.get('/v1/admin/orders', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listOrders(query.limit);
  });

  app.post('/v1/admin/orders/:orderNo/reconcile', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminOrderParamsSchema.parse(request.params);
    return new AdminService(app.db, app.appEnv).reconcileOrder(params.orderNo);
  });

  app.get('/v1/admin/installs', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listInstalls(query.limit);
  });

  app.get('/v1/admin/entitlements', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listEntitlements(query.limit);
  });

  app.put('/v1/admin/payment-settings/wechat', { preHandler: app.requireAdmin }, async (request) => {
    const payload = wechatPaymentSettingsSchema.parse(request.body);

    return new PaymentSettingsService(app.db, app.appEnv).upsertWechatSettings(payload, request.user.sub);
  });

  app.put('/v1/admin/payment-settings/alipay', { preHandler: app.requireAdmin }, async (request) => {
    const payload = alipayPaymentSettingsSchema.parse(request.body);

    return new PaymentSettingsService(app.db, app.appEnv).upsertAlipaySettings(payload, request.user.sub);
  });

  app.delete('/v1/admin/payment-settings/:provider', { preHandler: app.requireAdmin }, async (request) => {
    const params = paymentProviderParamsSchema.parse(request.params);

    await new PaymentSettingsService(app.db, app.appEnv).clearProviderSettings(params.provider);

    return {
      ok: true
    };
  });
};
