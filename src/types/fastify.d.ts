import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { FastifyJWT } from '@fastify/jwt';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type * as schema from '../db/schema';
import type { AppEnv } from '../lib/env';
import type { AppPermission } from '../lib/rbac';

declare module 'fastify' {
  interface FastifyInstance {
    appEnv: AppEnv;
    db: NodePgDatabase<typeof schema>;
    pg: Pool;
    redis: Redis;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void | FastifyReply>;
    authenticateApp: (request: FastifyRequest, reply: FastifyReply) => Promise<void | FastifyReply>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void | FastifyReply>;
    requirePermission: (
      permissions: AppPermission | AppPermission[],
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void | FastifyReply>;
    requireEmailVerified: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void | FastifyReply>;
  }

  interface FastifyRequest {
    rawBody?: string | Buffer;
    appClient?: {
      appId: string;
      appCode: string;
      secretId: string;
    };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      email?: string;
      role?: string;
      emailVerified?: boolean;
      kind?: 'user' | 'app';
      appId?: string;
      appCode?: string;
      secretId?: string;
    };
    user: {
      sub: string;
      email?: string;
      role?: string;
      emailVerified?: boolean;
      kind?: 'user' | 'app';
      appId?: string;
      appCode?: string;
      secretId?: string;
    };
  }
}
