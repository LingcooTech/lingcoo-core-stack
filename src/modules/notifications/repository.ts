import { and, count, desc, eq } from 'drizzle-orm';

import { notifications } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class NotificationsRepository {
  constructor(private readonly db: DbExecutor) {}

  async insert(input: typeof notifications.$inferInsert) {
    const [item] = await this.db.insert(notifications).values(input).returning();
    return item;
  }

  async findByDedupeKey(dedupeKey: string) {
    const [item] = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.dedupeKey, dedupeKey))
      .limit(1);
    return item ?? null;
  }

  async findById(id: string) {
    const [item] = await this.db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
    return item ?? null;
  }

  async listForUser(query: {
    userId: string;
    limit: number;
    offset: number;
    status?: 'unread' | 'read' | 'archived';
    category?: string;
  }) {
    const conditions = [eq(notifications.userId, query.userId)];

    if (query.status) {
      conditions.push(eq(notifications.status, query.status));
    }

    if (query.category) {
      conditions.push(eq(notifications.category, query.category));
    }

    const where = and(...conditions);

    const [items, totalResult] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ count: count() })
        .from(notifications)
        .where(where)
    ]);

    return {
      items,
      total: Number(totalResult[0]?.count ?? 0),
    };
  }

  async countUnreadByUser(userId: string) {
    const [result] = await this.db
      .select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.status, 'unread')));

    return Number(result?.count ?? 0);
  }

  async markAsRead(notificationId: string, userId: string) {
    const [item] = await this.db
      .update(notifications)
      .set({
        status: 'read',
        readAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .returning();

    return item ?? null;
  }

  async markAllAsRead(userId: string) {
    return this.db
      .update(notifications)
      .set({
        status: 'read',
        readAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(notifications.userId, userId), eq(notifications.status, 'unread')))
      .returning();
  }

  async archive(notificationId: string, userId: string) {
    const [item] = await this.db
      .update(notifications)
      .set({
        status: 'archived',
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .returning();
    return item ?? null;
  }
}
