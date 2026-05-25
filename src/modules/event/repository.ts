import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { apps, events, installs, users } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export type EventRecordInput = {
  userId?: string;
  appId?: string;
  installId?: string;
  eventName: string;
  eventTime?: Date;
  properties?: Record<string, unknown>;
};

export class EventRepository {
  constructor(private readonly db: DbExecutor) {}

  async insertMany(items: EventRecordInput[]) {
    if (items.length === 0) {
      return [];
    }

    return this.db
      .insert(events)
      .values(
        items.map((item) => ({
          userId: item.userId ?? null,
          appId: item.appId ?? null,
          installId: item.installId ?? null,
          eventName: item.eventName,
          eventTime: item.eventTime ?? new Date(),
          properties: item.properties ?? {},
        })),
      )
      .returning();
  }

  async listRecentEvents(limit = 50) {
    return this.db.select().from(events).orderBy(desc(events.eventTime)).limit(limit);
  }

  async listEvents(query: { limit: number; offset: number; search?: string }) {
    const conditions = [];

    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(events.eventName, pattern),
          ilike(sql`${events.id}::text`, pattern),
          ilike(sql`${events.appId}::text`, pattern),
          ilike(sql`${events.installId}::text`, pattern),
          ilike(users.email, pattern),
          ilike(users.displayName, pattern),
          ilike(installs.extensionInstallId, pattern),
          ilike(apps.code, pattern),
          ilike(apps.name, pattern),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.db
        .select({ item: events })
        .from(events)
        .leftJoin(users, eq(events.userId, users.id))
        .leftJoin(installs, eq(events.installId, installs.id))
        .leftJoin(apps, sql`coalesce(${events.appId}, ${installs.appId}) = ${apps.id}`)
        .where(where)
        .orderBy(desc(events.eventTime))
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(events)
        .leftJoin(users, eq(events.userId, users.id))
        .leftJoin(installs, eq(events.installId, installs.id))
        .leftJoin(apps, sql`coalesce(${events.appId}, ${installs.appId}) = ${apps.id}`)
        .where(where),
    ]);

    return {
      items: rows.map((row) => row.item),
      total: countResult[0]?.count ?? 0,
    };
  }

  async listRecentEventsByOrderNo(orderNo: string, limit = 30) {
    return this.db
      .select()
      .from(events)
      .where(sql`${events.properties} ->> 'orderNo' = ${orderNo}`)
      .orderBy(desc(events.eventTime))
      .limit(limit);
  }

  async listRecentEventsByUserId(userId: string, limit = 10) {
    return this.db
      .select()
      .from(events)
      .where(eq(events.userId, userId))
      .orderBy(desc(events.eventTime))
      .limit(limit);
  }
}
