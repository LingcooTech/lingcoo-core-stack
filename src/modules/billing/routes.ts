import { itemRefundRoutes } from './item-refund-routes';
import { hostingOfferRoutes } from './hosting-offer-routes';
import type { FastifyPluginAsync } from 'fastify';

import { PaymentSettingsService } from '../settings/public';
import { getBillingProviderAdapter } from './providers';
import { createOrderSchema, orderNoParamsSchema } from './schemas';

export const billingRoutes: FastifyPluginAsync = async (app) => {
  await app.register(hostingOfferRoutes);
  await app.register(itemRefundRoutes);
  app.get('/v1/billing/providers', async () => {
    return {
      items: await app.services.BillingService.listProviders(),
    };
  });

  app.post('/v1/billing/orders', { preHandler: app.authenticate }, async (request, reply) => {
    const payload = createOrderSchema.parse(request.body);
    const result = await app.services.BillingService.createOrder({
      userId: request.user.sub,
      commandId: request.idempotencyClaim?.id,
      clientIp: request.ip,
      ...payload,
    });

    return reply.status(201).send(result);
  });

  app.get('/v1/billing/orders/me', { preHandler: app.authenticate }, async (request) => {
    return {
      items: await app.services.BillingService.listOrdersByUser(request.user.sub),
    };
  });

  app.post(
    '/v1/billing/orders/:orderNo/sync',
    { preHandler: app.authenticate },
    async (request) => {
      const params = orderNoParamsSchema.parse(request.params);

      return app.services.BillingService.syncOrderStatus({
        orderNo: params.orderNo,
        userId: request.user.sub,
        role: request.user.role,
      });
    },
  );

  app.post(
    '/v1/billing/orders/:orderNo/mock-pay',
    { preHandler: app.authenticate },
    async (request) => {
      const params = orderNoParamsSchema.parse(request.params);

      return app.services.BillingService.mockPayOrder({
        userId: request.user.sub,
        orderNo: params.orderNo,
      });
    },
  );

  app.post(
    '/v1/billing/providers/wechat/notify',
    { config: { rawBody: true } },
    async (request, reply) => {
      try {
        const runtimeEnv = await new PaymentSettingsService(app.db, app.appEnv).buildRuntimeEnv();
        const provider = getBillingProviderAdapter('wechat_pay');
        const notification = await provider.parseNotification({
          env: runtimeEnv,
          headers: request.headers as Record<string, unknown>,
          rawBody: request.rawBody,
          body: request.body,
        });

        if (notification.kind === 'paid') {
          await app.services.BillingService.handlePaymentNotification(notification);
        } else {
          request.log.info(
            {
              providerEventId: notification.providerEventId,
              reason: notification.reason,
            },
            'wechat pay notification ignored',
          );
        }

        return reply
          .status(200)
          .type('text/xml; charset=utf-8')
          .send(
            '<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>',
          );
      } catch (error) {
        request.log.error({ err: error }, 'wechat pay notification failed');
        return reply
          .status(200)
          .type('text/xml; charset=utf-8')
          .send(
            '<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[FAIL]]></return_msg></xml>',
          );
      }
    },
  );

  app.post(
    '/v1/billing/providers/alipay/notify',
    { config: { rawBody: true } },
    async (request, reply) => {
      try {
        const runtimeEnv = await new PaymentSettingsService(app.db, app.appEnv).buildRuntimeEnv();
        const provider = getBillingProviderAdapter('alipay');
        const notification = await provider.parseNotification({
          env: runtimeEnv,
          headers: request.headers as Record<string, unknown>,
          rawBody: request.rawBody,
          body: request.body,
        });

        if (notification.kind === 'paid') {
          await app.services.BillingService.handlePaymentNotification(notification);
        } else {
          request.log.info(
            {
              providerEventId: notification.providerEventId,
              reason: notification.reason,
            },
            'alipay notification ignored',
          );
        }

        return reply.type('text/plain; charset=utf-8').send('success');
      } catch (error) {
        request.log.error({ err: error }, 'alipay notification failed');
        return reply.status(500).type('text/plain; charset=utf-8').send('failure');
      }
    },
  );
};
