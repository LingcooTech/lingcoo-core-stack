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
      clientIp: request.ip,
      ...payload
    });

    return reply.status(201).send(result);
  });

  app.get('/v1/billing/orders/me', { preHandler: app.authenticate }, async (request) => {
    return {
      items: await new BillingService(app.db, app.appEnv).listOrdersByUser(request.user.sub)
    };
  });

  app.post('/v1/billing/orders/:orderNo/sync', { preHandler: app.authenticate }, async (request) => {
    const params = orderNoParamsSchema.parse(request.params);

    return new BillingService(app.db, app.appEnv).syncOrderStatus({
      orderNo: params.orderNo,
      userId: request.user.sub,
      role: request.user.role
    });
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
      request.log.info(
        {
          headers: request.headers,
          hasRawBody: Boolean(request.rawBody),
          rawBodyLength: typeof request.rawBody === 'string' ? request.rawBody.length : request.rawBody?.length ?? 0
        },
        'wechat pay notification received'
      );

      const runtimeEnv = await new PaymentSettingsService(app.db, app.appEnv).buildRuntimeEnv();
      const provider = getBillingProviderAdapter('wechat_pay');
      const notification = await provider.parseNotification({
        env: runtimeEnv,
        headers: request.headers as Record<string, unknown>,
        rawBody: request.rawBody,
        body: request.body
      });

      request.log.info(
        {
          providerEventId: notification.providerEventId,
          kind: notification.kind,
          orderNo: notification.kind === 'paid' ? notification.orderNo : undefined,
          providerOrderId: notification.kind === 'paid' ? notification.providerOrderId : undefined,
          reason: notification.kind === 'paid' ? undefined : notification.reason
        },
        'wechat pay notification parsed'
      );

      if (notification.kind === 'paid') {
        const result = await new BillingService(app.db, app.appEnv).handlePaymentNotification(notification);
        request.log.info(
          {
            providerEventId: notification.providerEventId,
            orderNo: notification.orderNo,
            duplicate: result.duplicate,
            granted: Boolean(result.granted)
          },
          'wechat pay notification handled'
        );
      } else {
        request.log.info(
          {
            providerEventId: notification.providerEventId,
            reason: notification.reason
          },
          'wechat pay notification ignored'
        );
      }

      return reply
        .status(200)
        .type('text/xml; charset=utf-8')
        .send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
    } catch (error) {
      request.log.error({ err: error }, 'wechat pay notification failed');
      return reply
        .status(200)
        .type('text/xml; charset=utf-8')
        .send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[FAIL]]></return_msg></xml>');
    }
  });

  app.post('/v1/billing/providers/alipay/notify', { config: { rawBody: true } }, async (request, reply) => {
    try {
      request.log.info(
        {
          headers: request.headers,
          hasRawBody: Boolean(request.rawBody),
          rawBodyLength: typeof request.rawBody === 'string' ? request.rawBody.length : request.rawBody?.length ?? 0
        },
        'alipay notification received'
      );

      const runtimeEnv = await new PaymentSettingsService(app.db, app.appEnv).buildRuntimeEnv();
      const provider = getBillingProviderAdapter('alipay');
      const notification = await provider.parseNotification({
        env: runtimeEnv,
        headers: request.headers as Record<string, unknown>,
        rawBody: request.rawBody,
        body: request.body
      });

      request.log.info(
        {
          providerEventId: notification.providerEventId,
          kind: notification.kind,
          orderNo: notification.kind === 'paid' ? notification.orderNo : undefined,
          providerOrderId: notification.kind === 'paid' ? notification.providerOrderId : undefined,
          reason: notification.kind === 'paid' ? undefined : notification.reason
        },
        'alipay notification parsed'
      );

      if (notification.kind === 'paid') {
        const result = await new BillingService(app.db, app.appEnv).handlePaymentNotification(notification);
        request.log.info(
          {
            providerEventId: notification.providerEventId,
            orderNo: notification.orderNo,
            duplicate: result.duplicate,
            granted: Boolean(result.granted)
          },
          'alipay notification handled'
        );
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
