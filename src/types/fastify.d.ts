import type { createAdminCommandRunner } from '../http/admin-commands';
import type { SettingsRegistry } from '../modules/settings/public';
import type { ApiServices } from '../composition/api-runtime';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import '@fastify/jwt';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import type { FastifyReply, FastifyRequest as Request } from 'fastify';

import type * as schema from '../db/schema';
import type { AppEnv } from '../lib/env';
import type { AppPermission } from '../lib/rbac';

declare module 'fastify' {
  interface FastifyInstance {
    isDraining: boolean;
    appEnv: AppEnv;
    services: ApiServices;
    settings: SettingsRegistry;
    runAdminCommand: ReturnType<typeof createAdminCommandRunner>;
    db: NodePgDatabase<typeof schema>;
    pg: Pool;
    redis: Redis;
    authenticate: (request: Request, reply: FastifyReply) => Promise<void | FastifyReply>;
    authenticateApp: (request: Request, reply: FastifyReply) => Promise<void | FastifyReply>;
    requireAdmin: (request: Request, reply: FastifyReply) => Promise<void | FastifyReply>;
    requirePermission: (
      permissions: AppPermission | AppPermission[],
    ) => (request: Request, reply: FastifyReply) => Promise<void | FastifyReply>;
    requireEmailVerified: (request: Request, reply: FastifyReply) => Promise<void | FastifyReply>;
  }

  interface FastifyRequest {
    browserSessionId?: string;
    rawBody?: string | Buffer;
    idempotencyClaim?: { id: string; ownerToken: string };
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
      authVersion?: number;
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
      authVersion?: number;
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
