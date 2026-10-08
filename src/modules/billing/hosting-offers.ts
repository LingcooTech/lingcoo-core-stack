import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  HostingOfferSchema,
  hostingProfileSchema,
  type HostingOfferCreate,
  type HostingOfferWrite,
} from '@lingcoo/contracts';
import { apps, hostingOffers } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import { AuditLogService } from '../../lib/audit-logs';
import { httpError } from '../../lib/errors';

function view(row: typeof hostingOffers.$inferSelect) {
  return HostingOfferSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
export class HostingOfferCatalog {
  constructor(private readonly db: DbExecutor) {}
  async forApp(appCode: string) {
    const [app] = await this.db
      .select()
      .from(apps)
      .where(and(eq(apps.code, appCode), eq(apps.status, 'active')));
    if (!app) throw httpError(404, '应用不存在');
    const rows = await this.db
      .select()
      .from(hostingOffers)
      .where(and(eq(hostingOffers.appId, app.id), eq(hostingOffers.status, 'active')))
      .orderBy(asc(hostingOffers.priceAmount));
    return { items: rows.map(view) };
  }
  async resolve(id: string, appId: string, expectedVersion: number) {
    const [app] = await this.db.select().from(apps).where(eq(apps.id, appId));
    const meta = app?.meta as Record<string, unknown> | undefined;
    const profile = hostingProfileSchema.safeParse(meta?.hostingProfile);
    if (
      !app ||
      app.status !== 'active' ||
      meta?.deliveryMode !== 'one_click' ||
      !profile.success ||
      !profile.data.enabled
    )
      throw httpError(409, '应用尚未开放托管交付');
    const [offer] = await this.db
      .select()
      .from(hostingOffers)
      .where(
        and(
          eq(hostingOffers.id, id),
          eq(hostingOffers.appId, appId),
          eq(hostingOffers.status, 'active'),
        ),
      );
    if (!offer || offer.priceAmount <= 0) throw httpError(409, '托管套餐不可购买');
    if (offer.version !== expectedVersion) throw httpError(409, '托管报价已变化，请刷新后确认');
    return view(offer);
  }
  async list(query: { appId?: string; offset: number; limit: number }) {
    const where = query.appId ? eq(hostingOffers.appId, query.appId) : undefined;
    const items = await this.db
      .select()
      .from(hostingOffers)
      .where(where)
      .orderBy(desc(hostingOffers.createdAt), asc(hostingOffers.id))
      .limit(query.limit)
      .offset(query.offset);
    const [count] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(hostingOffers)
      .where(where);
    const applicationChoices = await this.db
      .select({ id: apps.id, code: apps.code, name: apps.name })
      .from(apps)
      .orderBy(asc(apps.name), asc(apps.id));
    return { items: items.map(view), total: count?.count ?? 0, apps: applicationChoices };
  }
  async create(actorUserId: string, input: HostingOfferCreate) {
    return this.db.transaction(async (tx) => {
      const { reason, ...values } = input;
      const [app] = await tx.select({ id: apps.id }).from(apps).where(eq(apps.id, input.appId));
      if (!app) throw httpError(404, '应用不存在');
      const [row] = await tx.insert(hostingOffers).values(values).onConflictDoNothing().returning();
      if (!row) {
        // Stable client UUID makes a network retry safe; never duplicate the catalog entry.
        const [existing] = await tx
          .select()
          .from(hostingOffers)
          .where(eq(hostingOffers.id, input.id));
        if (
          existing &&
          Object.entries(values).every(([key, value]) => Reflect.get(existing, key) === value)
        )
          return view(existing);
        throw httpError(409, '套餐编码或请求标识已存在，请刷新列表');
      }
      await new AuditLogService(tx).record({
        actorType: 'user',
        actorUserId,
        action: 'billing.hosting_offer_created',
        resourceType: 'hosting_offer',
        resourceId: row.id,
        summary: '创建托管套餐',
        meta: { reason, after: view(row) },
      });
      return view(row);
    });
  }
  async update(id: string, actorUserId: string, input: HostingOfferWrite) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(hostingOffers)
        .where(eq(hostingOffers.id, id))
        .for('update');
      if (!before) throw httpError(404, '托管套餐不存在');
      if (before.version !== input.expectedVersion)
        throw httpError(409, '套餐已变化，请刷新后重试');
      const { expectedVersion, reason, ...values } = input;
      const [row] = await tx
        .update(hostingOffers)
        .set({ ...values, version: expectedVersion + 1, updatedAt: new Date() })
        .where(and(eq(hostingOffers.id, id), eq(hostingOffers.version, expectedVersion)))
        .returning();
      if (!row) throw httpError(409, '套餐已变化，请刷新后重试');
      await new AuditLogService(tx).record({
        actorType: 'user',
        actorUserId,
        action: 'billing.hosting_offer_updated',
        resourceType: 'hosting_offer',
        resourceId: id,
        summary: '修改托管套餐',
        meta: { reason, before: view(before), after: view(row) },
      });
      return view(row);
    });
  }
}
