import type { FastifyPluginAsync } from 'fastify';

import { renderCheckoutPage } from './page';
import { checkoutSessionParamsSchema, createCheckoutSessionSchema } from './schemas';
import { CheckoutService } from './service';

export const checkoutRoutes: FastifyPluginAsync = async (app) => {
  app.get('/checkout/:sessionCode', async (request, reply) => {
    const params = checkoutSessionParamsSchema.parse(request.params);
    reply
      .type('text/html; charset=utf-8')
      .header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';"
      );

    return reply.send(renderCheckoutPage(params.sessionCode));
  });

  app.post('/v1/checkout/sessions', { preHandler: app.authenticate }, async (request, reply) => {
    const payload = createCheckoutSessionSchema.parse(request.body);
    const result = await new CheckoutService(app.db, app.appEnv).createSession({
      userId: request.user.sub,
      clientIp: request.ip,
      ...payload
    });

    return reply.status(201).send(result);
  });

  app.get('/v1/checkout/sessions/:sessionCode', { preHandler: app.authenticate }, async (request) => {
    const params = checkoutSessionParamsSchema.parse(request.params);
    return new CheckoutService(app.db, app.appEnv).getOwnedSession({
      sessionCode: params.sessionCode,
      userId: request.user.sub,
      role: request.user.role
    });
  });

  app.get('/v1/checkout/sessions/:sessionCode/public', async (request) => {
    const params = checkoutSessionParamsSchema.parse(request.params);
    return new CheckoutService(app.db, app.appEnv).getPublicSession(params.sessionCode);
  });

  app.get('/v1/checkout/sessions/:sessionCode/status', async (request) => {
    const params = checkoutSessionParamsSchema.parse(request.params);
    return new CheckoutService(app.db, app.appEnv).getSessionStatus(params.sessionCode);
  });
};
