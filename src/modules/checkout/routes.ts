import type { FastifyPluginAsync } from 'fastify';

import {
  buildSessionRateLimitKey,
  buildUserRateLimitKey
} from '../../lib/rate-limit';
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

  // POST /v1/checkout/sessions
  // 公开客户端（Chrome 扩展等）只需用户 JWT + appCode。
  // appCode 是公开标识符（非秘密），服务层负责验证 App 是否激活并允许该产品。
  app.post('/v1/checkout/sessions', {
    preHandler: app.authenticate,
    config: {
      rateLimit: {
        hook: 'preHandler',
        max: 10,
        timeWindow: '1 minute',
        keyGenerator: (request: Parameters<typeof buildUserRateLimitKey>[0]) =>
          buildUserRateLimitKey(request, 'checkout-create')
      }
    }
  }, async (request, reply) => {
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

  app.get('/v1/checkout/sessions/:sessionCode/public', {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
        keyGenerator: (request: Parameters<typeof buildSessionRateLimitKey>[0]) =>
          buildSessionRateLimitKey(request, 'checkout-public')
      }
    }
  }, async (request) => {
    const params = checkoutSessionParamsSchema.parse(request.params);
    return new CheckoutService(app.db, app.appEnv).getPublicSession(params.sessionCode);
  });

  app.get('/v1/checkout/sessions/:sessionCode/status', {
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: (request: Parameters<typeof buildSessionRateLimitKey>[0]) =>
          buildSessionRateLimitKey(request, 'checkout-status')
      }
    }
  }, async (request) => {
    const params = checkoutSessionParamsSchema.parse(request.params);
    return new CheckoutService(app.db, app.appEnv).getSessionStatus(params.sessionCode);
  });

  app.post('/v1/checkout/sessions/:sessionCode/reconcile', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
        keyGenerator: (request: Parameters<typeof buildSessionRateLimitKey>[0]) =>
          buildSessionRateLimitKey(request, 'checkout-reconcile')
      }
    }
  }, async (request) => {
    const params = checkoutSessionParamsSchema.parse(request.params);
    return new CheckoutService(app.db, app.appEnv).reconcileSession(params.sessionCode);
  });
};
