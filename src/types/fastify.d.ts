import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { FastifyJWT } from '@fastify/jwt';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type * as schema from '../db/schema';
import type { AppEnv } from '../lib/env';

declare module 'fastify' {
  interface FastifyInstance {
    appEnv: AppEnv;
    db: NodePgDatabase<typeof schema>;
    pg: Pool;
    redis: Redis;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void | FastifyReply>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void | FastifyReply>;
  }

  interface FastifyRequest {
    rawBody?: string | Buffer;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      role?: string;
    };
    user: {
      sub: string;
      role?: string;
    };
  }
}
