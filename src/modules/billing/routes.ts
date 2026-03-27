import type { FastifyPluginAsync } from 'fastify';

import { PaymentSettingsService } from '../../lib/payment-settings';
import { getBillingProviderAdapter } from './providers';
import { createOrderSchema, orderNoParamsSchema } from './schemas';
import { BillingService } from './service';

export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/billing/providers', async () => {
    return {
      items: await new BillingService(app.db, app.appEnv).listProviders()
    };
  });

  app.post('/v1/billing/orders', { preHandler: app.authenticate }, async (request, reply) => {
    const payload = createOrderSchema.parse(request.body);
    const result = await new BillingService(app.db, app.appEnv).createOrder({
      userId: request.user.sub,
      ...payload
    });

    return reply.status(201).send(result);
  });

  app.get('/v1/billing/orders/me', { preHandler: app.authenticate }, async (request) => {
    return {
      items: await new BillingService(app.db, app.appEnv).listOrdersByUser(request.user.sub)
    };
  });

  app.post('/v1/billing/orders/:orderNo/mock-pay', { preHandler: app.authenticate }, async (request) => {
    const params = orderNoParamsSchema.parse(request.params);

    return new BillingService(app.db, app.appEnv).mockPayOrder({
      userId: request.user.sub,
      orderNo: params.orderNo
    });
  });

  app.post('/v1/billing/providers/wechat/notify', { config: { rawBody: true } }, async (request, reply) => {
    try {
      const runtimeEnv = await new PaymentSettingsService(app.db, app.appEnv).buildRuntimeEnv();
      const provider = getBillingProviderAdapter('wechat_pay');
      const notification = await provider.parseNotification({
        env: runtimeEnv,
        headers: request.headers as Record<string, unknown>,
        rawBody: request.rawBody,
        body: request.body
      });

      if (notification.kind === 'paid') {
        await new BillingService(app.db, app.appEnv).handlePaymentNotification(notification);
      } else {
        request.log.info(
          {
            providerEventId: notification.providerEventId,
            reason: notification.reason
          },
          'wechat pay notification ignored'
        );
      }

      return reply.status(200).send({
        code: 'SUCCESS',
        message: '成功'
      });
    } catch (error) {
      request.log.error({ err: error }, 'wechat pay notification failed');
      return reply.status(500).send({
        code: 'FAIL',
        message: error instanceof Error ? error.message : 'failed'
      });
    }
  });

  app.post('/v1/billing/providers/alipay/notify', { config: { rawBody: true } }, async (request, reply) => {
    try {
      const runtimeEnv = await new PaymentSettingsService(app.db, app.appEnv).buildRuntimeEnv();
      const provider = getBillingProviderAdapter('alipay');
      const notification = await provider.parseNotification({
        env: runtimeEnv,
        headers: request.headers as Record<string, unknown>,
        rawBody: request.rawBody,
        body: request.body
      });

      if (notification.kind === 'paid') {
        await new BillingService(app.db, app.appEnv).handlePaymentNotification(notification);
      } else {
        request.log.info(
          {
            providerEventId: notification.providerEventId,
            reason: notification.reason
          },
          'alipay notification ignored'
        );
      }

      return reply.type('text/plain; charset=utf-8').send('success');
    } catch (error) {
      request.log.error({ err: error }, 'alipay notification failed');
      return reply.status(500).type('text/plain; charset=utf-8').send('failure');
    }
  });
};
