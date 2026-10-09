import { storageSettingsSchema } from '@lingcoo/contracts';
import {
  wechatPaymentSettingsSchema,
  smtpSettingsSchema,
  alertingSettingsSchema,
  qiniuSettingsSchema,
  siteSettingsSchema,
  publicPagesSettingsSchema,
  contentImportSettingsSchema,
  adminUpsertDeliverySettingsSchema,
} from './schemas';
import { z } from 'zod';
import { acquireTransactionLock } from '../../db/locks';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { DbExecutor } from '../../db/types';
import { settingsRevisions } from '../../db/schema';
import { httpError } from '../../lib/errors';
import { AuditLogService, auditContext } from '../audit/public';
export const settingDefinitions = {
  storage: {
    schema: storageSettingsSchema,
    connectionTest: true,
    scope: 'system',
    visibility: 'secret',
    precedence: ['database', 'env', 'legacy', 'default'],
  },
  payment: {
    schema: wechatPaymentSettingsSchema,
    connectionTest: false,
    scope: 'system',
    visibility: 'secret',
    precedence: ['database', 'env', 'default'],
  },
  smtp: {
    schema: smtpSettingsSchema,
    connectionTest: true,
    scope: 'system',
    visibility: 'secret',
    precedence: ['database', 'env', 'default'],
  },
  alerting: {
    schema: alertingSettingsSchema,
    connectionTest: false,
    scope: 'system',
    visibility: 'secret',
    precedence: ['database', 'env', 'default'],
  },
  qiniu: {
    schema: qiniuSettingsSchema,
    connectionTest: true,
    scope: 'system',
    visibility: 'secret',
    precedence: ['database', 'env', 'default'],
  },
  site: {
    schema: siteSettingsSchema,
    connectionTest: false,
    scope: 'system',
    visibility: 'public',
    precedence: ['database', 'default'],
  },
  'public-pages': {
    schema: publicPagesSettingsSchema,
    connectionTest: false,
    scope: 'system',
    visibility: 'public',
    precedence: ['database', 'default'],
  },
  'content-import': {
    schema: contentImportSettingsSchema,
    connectionTest: true,
    scope: 'system',
    visibility: 'secret',
    precedence: ['database', 'default'],
  },
  openrouter: {
    schema: z.record(z.string(), z.unknown()),
    connectionTest: true,
    scope: 'system',
    visibility: 'secret',
    precedence: ['database', 'env', 'default'],
  },
  delivery: {
    schema: adminUpsertDeliverySettingsSchema,
    connectionTest: false,
    scope: 'application',
    visibility: 'secret',
    precedence: ['database', 'legacy', 'manifest'],
  },
} as const;
export function settingsKeyForPath(path: string): string | null {
  const clean = path.split('?')[0] ?? '';
  const delivery = clean.match(/^\/v1\/admin\/delivery-settings\/([^/]+)$/);
  if (delivery?.[1]) return `delivery:${decodeURIComponent(delivery[1])}`;
  if (/^\/v1\/admin\/payment-settings(?:\/(wechat|wechat_pay|alipay))?$/.test(clean))
    return 'payment';
  const system = clean.match(/^\/v1\/admin\/system-settings\/([^/]+)$/);
  if (system?.[1] && system[1] in settingDefinitions) return system[1];
  if (clean === '/v1/admin/system-settings/ai/providers/openrouter') return 'openrouter';
  return null;
}
export class SettingsRegistry {
  private readonly responseVersions = new WeakMap<FastifyRequest, number>();
  constructor(private readonly db: DbExecutor) {}
  async responseVersion(request: FastifyRequest, key: string) {
    return this.responseVersions.get(request) ?? (await this.version(key));
  }
  async read<T>(request: FastifyRequest, work: (executor: DbExecutor) => Promise<T>): Promise<T> {
    const key = settingsKeyForPath(request.url);
    if (!key) throw httpError(400, 'Unregistered setting');
    return this.db.transaction(async (tx) => {
      await acquireTransactionLock(tx, `settings:${key}`);
      const version = await new SettingsRegistry(tx).version(key);
      const result = await work(tx);
      this.responseVersions.set(request, version);
      return result;
    });
  }
  async version(key: string) {
    const [row] = await this.db
      .select()
      .from(settingsRevisions)
      .where(eq(settingsRevisions.key, key))
      .limit(1);
    return row?.version ?? 0;
  }
  async mutate<T>(request: FastifyRequest, work: (executor: DbExecutor) => Promise<T>): Promise<T> {
    const key = settingsKeyForPath(request.url);
    if (!key) throw httpError(400, 'Unregistered setting');
    const header = request.headers['if-match'];
    const expected =
      typeof header === 'string' && /^"?\d+"?$/.test(header)
        ? Number(header.replaceAll('"', ''))
        : undefined;
    if (header !== undefined && expected === undefined)
      throw httpError(400, 'Invalid settings version');
    return this.db.transaction(async (tx) => {
      await acquireTransactionLock(tx, `settings:${key}`);
      const current = await new SettingsRegistry(tx).version(key);
      if (expected !== undefined && current !== expected)
        throw httpError(409, 'Settings changed; reload before saving');
      const result = await work(tx);
      await tx
        .insert(settingsRevisions)
        .values({ key, version: current + 1, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settingsRevisions.key,
          set: { version: current + 1, updatedAt: new Date() },
        });
      await new AuditLogService(tx).record({
        ...auditContext(request),
        action: 'settings.changed',
        resourceType: 'settings',
        resourceId: key,
        summary: 'Settings updated',
        meta: { version: current + 1, operation: request.method },
      });
      this.responseVersions.set(request, current + 1);
      return result;
    });
  }
}
