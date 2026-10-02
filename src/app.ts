import type { ServiceFactories } from './composition/service-factories';
import { createApiServices } from './composition/api-runtime';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import { safeErrorResponse } from './http/safe-errors';

import { createAuthAccess } from './modules/auth/public';

import { appModules } from './modules';
import { dbPlugin } from './plugins/db';
import { redisPlugin } from './plugins/redis';
import { type AppEnv } from './lib/env';
import { httpError } from './lib/errors';
import {
  canAccessAdminConsole,
  hasAnyPermission,
  normalizeRole,
  type AppPermission,
} from './lib/rbac';

function normalizeCorsOrigin(value: string): true | string[] {
  if (value.trim() === '*') {
    return true;
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function buildApp(env: AppEnv, options: { factories?: ServiceFactories } = {}) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-fd-app-token"]',
        'password',
        'token',
        'secrets',
      ],
    },
    trustProxy: env.TRUST_PROXY ?? false,
  });

  app.decorate('appEnv', env);

  await app.register(sensible);
  await app.register(cors, {
    origin: normalizeCorsOrigin(env.CORS_ORIGIN),
    credentials: true,
  });
  await app.register(helmet);
  await app.register(cookie);
  await app.register(formbody);
  await app.register(fastifyRawBody, {
    field: 'rawBody',
    global: false,
    encoding: 'utf8',
    runFirst: true,
  });
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: 'fd_core_token',
      signed: false,
    },
  });
  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
      if (
        request.user.kind === 'app' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          request.user.sub ?? '',
        )
      ) {
        return reply.unauthorized('A user access token is required');
      }
      const user = await createAuthAccess(app.db).findUserById(request.user.sub);
      if (!user || user.status !== 'active') return reply.unauthorized('User is unavailable');
      request.user.role = user.role;
      request.user.emailVerified = user.emailVerified;
    } catch (error) {
      return reply.unauthorized('Invalid or expired access token');
    }
  });
  app.decorate('authenticateApp', async (request, reply) => {
    const tokenHeader = request.headers['x-fd-app-token'];
    const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;

    if (!token || typeof token !== 'string') {
      return reply.unauthorized('Missing app token');
    }

    try {
      const payload = await app.jwt.verify<{
        kind?: 'user' | 'app';
        appId?: string;
        appCode?: string;
        secretId?: string;
      }>(token);

      if (payload.kind !== 'app' || !payload.appId || !payload.appCode || !payload.secretId) {
        return reply.unauthorized('Invalid app token');
      }

      const routeAppCode =
        request.params && typeof request.params === 'object' && 'appCode' in request.params
          ? String((request.params as Record<string, unknown>).appCode ?? '').trim()
          : '';

      if (routeAppCode && routeAppCode !== payload.appCode) {
        throw httpError(403, 'App token does not match requested app');
      }

      await app.services.AppService.requireActiveSecretById(payload.appCode, payload.secretId);
      request.appClient = {
        appId: payload.appId,
        appCode: payload.appCode,
        secretId: payload.secretId,
      };
    } catch (error) {
      if (reply.sent) {
        return reply;
      }

      if (error instanceof Error && 'statusCode' in error) {
        const statusCode =
          typeof (error as { statusCode?: number }).statusCode === 'number'
            ? (error as { statusCode: number }).statusCode
            : 401;
        return reply.status(statusCode).send({
          error: error.name || 'UnauthorizedError',
          message: error.message,
        });
      }

      return reply.unauthorized('Invalid or expired app token');
    }
  });
  app.decorate('requireAdmin', async (request, reply) => {
    const authResult = await app.authenticate(request, reply);

    if (authResult !== undefined) {
      return authResult;
    }

    const user = await createAuthAccess(app.db).findUserById(request.user.sub);

    if (!user || !canAccessAdminConsole(normalizeRole(user.role))) {
      return reply.forbidden('Admin access is required');
    }
  });
  app.decorate('requirePermission', (permissions: AppPermission | AppPermission[]) => {
    const required = Array.isArray(permissions) ? permissions : [permissions];
    return async (request, reply) => {
      const authResult = await app.authenticate(request, reply);

      if (authResult !== undefined) {
        return authResult;
      }

      const user = await createAuthAccess(app.db).findUserById(request.user.sub);

      if (!user || !canAccessAdminConsole(normalizeRole(user.role))) {
        return reply.forbidden('Admin access is required');
      }

      if (!hasAnyPermission(normalizeRole(user.role), required)) {
        return reply.forbidden('Insufficient permission');
      }
    };
  });
  app.decorate('requireEmailVerified', async (request, reply) => {
    const authResult = await app.authenticate(request, reply);

    if (authResult !== undefined) {
      return authResult;
    }

    const user = await createAuthAccess(app.db).findUserById(request.user.sub);

    if (!user) {
      return reply.unauthorized('User not found');
    }

    if (!user.emailVerified) {
      return reply.status(403).send({
        error: 'EmailNotVerified',
        message: 'Please verify your email address',
      });
    }
  });
  await app.register(dbPlugin, { env });
  app.decorate('services', createApiServices(app.db, env, options.factories));
  await app.register(redisPlugin, { env });
  await app.register(rateLimit, {
    redis: app.redis,
    max: env.RATE_LIMIT_GLOBAL_MAX,
    timeWindow: env.RATE_LIMIT_GLOBAL_WINDOW,
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: env.APP_NAME,
        version: '0.1.0',
      },
    },
  });
  if (env.API_DOCS_ENABLED ?? env.NODE_ENV !== 'production') {
    await app.register(swaggerUi, { routePrefix: '/api-docs' });
  }

  for (const module of appModules) {
    await app.register(module.register);
  }

  app.setErrorHandler((error, request, reply) => {
    const response = safeErrorResponse(error, request.id);
    request.log.error(
      { requestId: request.id, code: response.body.code, statusCode: response.status },
      'request failed',
    );
    return reply.status(response.status).send(response.body);
  });

  return app;
}
