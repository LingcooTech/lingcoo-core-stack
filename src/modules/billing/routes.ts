import type { FastifyPluginAsync } from 'fastify';

import { createOrderSchema, orderNoParamsSchema } from './schemas';
import { BillingService } from './service';

export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/billing/providers', async () => {
    return {
      items: new BillingService(app.db, app.appEnv).listProviders()
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

  app.post('/v1/billing/providers/wechat/notify', async (request, reply) => {
    request.log.info(
      {
        headers: request.headers,
        body: request.body
      },
      'wechat pay notify received'
    );

    return reply.status(501).send({
      error: 'NotImplemented',
      message: 'WeChat Pay callback signature verification is not implemented yet.'
    });
  });

  app.post('/v1/billing/providers/alipay/notify', async (request, reply) => {
    request.log.info(
      {
        headers: request.headers,
        body: request.body
      },
      'alipay notify received'
    );

    return reply.status(501).send({
      error: 'NotImplemented',
      message: 'Alipay callback signature verification is not implemented yet.'
    });
  });
};
