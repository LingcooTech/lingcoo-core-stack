import type { FastifyPluginAsync } from 'fastify';

import { PaymentSettingsService } from '../../lib/payment-settings';
import { AuthRepository } from '../auth/repository';
import { renderPaymentAdminPage } from './page';
import {
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
