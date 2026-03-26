import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import { ZodError } from 'zod';

import { appModules } from './modules';
import { dbPlugin } from './plugins/db';
import { redisPlugin } from './plugins/redis';
import { type AppEnv } from './lib/env';

function normalizeCorsOrigin(value: string): true | string[] {
  if (value.trim() === '*') {
    return true;
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function buildApp(env: AppEnv) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL
    }
  });

  app.decorate('appEnv', env);

  await app.register(sensible);
  await app.register(cors, {
    origin: normalizeCorsOrigin(env.CORS_ORIGIN),
    credentials: true
  });
  await app.register(helmet);
  await app.register(cookie);
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: 'fd_core_token',
      signed: false
    }
  });
  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (error) {
      return reply.unauthorized('Invalid or expired access token');
    }
  });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute'
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: env.APP_NAME,
        version: '0.1.0'
      }
    }
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs'
  });

  await app.register(dbPlugin, { env });
  await app.register(redisPlugin, { env });

  for (const module of appModules) {
    await app.register(module.register);
  }

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'request failed');

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'ValidationError',
        details: error.flatten()
      });
    }

    const statusCode =
      typeof (error as { statusCode?: number }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 500;

    const errorName = error instanceof Error ? error.name : 'InternalServerError';
    const errorMessage = error instanceof Error ? error.message : 'Unexpected error';

    return reply.status(statusCode).send({
      error: errorName,
      message: errorMessage
    });
  });

  return app;
}
