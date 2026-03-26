import { events } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export type EventRecordInput = {
  userId?: string;
  productId?: string;
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
          productId: item.productId ?? null,
          installId: item.installId ?? null,
          eventName: item.eventName,
          eventTime: item.eventTime ?? new Date(),
          properties: item.properties ?? {}
        }))
      )
      .returning();
  }
}
