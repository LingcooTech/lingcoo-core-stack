import { desc, sql } from 'drizzle-orm';

import { events } from '../../db/schema';
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
          properties: item.properties ?? {}
        }))
      )
      .returning();
  }

  async listRecentEvents(limit = 50) {
    return this.db.select().from(events).orderBy(desc(events.eventTime)).limit(limit);
  }

  async listRecentEventsByOrderNo(orderNo: string, limit = 30) {
    return this.db
      .select()
      .from(events)
      .where(sql`${events.properties} ->> 'orderNo' = ${orderNo}`)
      .orderBy(desc(events.eventTime))
      .limit(limit);
  }
}
