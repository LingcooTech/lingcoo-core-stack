import type { FastifyPluginAsync, FastifyReply } from 'fastify';

import { PaymentSettingsService } from '../../lib/payment-settings';
import { AuthRepository } from '../auth/repository';
import { renderAdminPage, type AdminSectionKey } from './page';
import { AdminService } from './service';
import {
  adminEntitlementParamsSchema,
  adminGrantEntitlementSchema,
  adminListQuerySchema,
  adminOrderParamsSchema,
  alipayPaymentSettingsSchema,
  paymentProviderParamsSchema,
  wechatPaymentSettingsSchema
} from './schemas';

export const adminRoutes: FastifyPluginAsync = async (app) => {
  const sendAdminPage = (section: AdminSectionKey) => async (_request: unknown, reply: FastifyReply) => {
    reply
      .type('text/html; charset=utf-8')
      .header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';"
      );

    return reply.send(renderAdminPage(section));
  };

  app.get('/admin', sendAdminPage('dashboard'));
  app.get('/admin/payments', sendAdminPage('payments'));
  app.get('/admin/apps', sendAdminPage('apps'));
  app.get('/admin/licenses', sendAdminPage('licenses'));
  app.get('/admin/operations', sendAdminPage('operations'));
  app.get('/admin/observability', sendAdminPage('observability'));

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

  app.get('/v1/admin/orders/:orderNo', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminOrderParamsSchema.parse(request.params);
    return new AdminService(app.db, app.appEnv).getOrderDetail(params.orderNo);
  });

  app.get('/v1/admin/installs', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listInstalls(query.limit);
  });

  app.get('/v1/admin/entitlements', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listEntitlements(query.limit);
  });

  app.post('/v1/admin/entitlements/grant', { preHandler: app.requireAdmin }, async (request) => {
    const payload = adminGrantEntitlementSchema.parse(request.body);
    return new AdminService(app.db, app.appEnv).grantEntitlement(payload, request.user.sub);
  });

  app.post('/v1/admin/entitlements/:entitlementId/revoke', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminEntitlementParamsSchema.parse(request.params);
    return new AdminService(app.db, app.appEnv).revokeEntitlement(params.entitlementId, request.user.sub);
  });

  app.get('/v1/admin/events', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listEvents(query.limit);
  });

  app.get('/v1/admin/billing-webhooks', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listBillingWebhookEvents(query.limit);
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
