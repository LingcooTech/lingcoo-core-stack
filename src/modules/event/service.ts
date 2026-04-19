import type { DbExecutor } from '../../db/types';
import type { DbClient } from '../../db/types';
import { EventRepository, type EventRecordInput } from './repository';
import { NotificationsService } from '../notifications/service';

export class EventService {
  private readonly repository: EventRepository;
  private readonly db: DbExecutor;

  constructor(db: DbExecutor) {
    this.db = db;
    this.repository = new EventRepository(db);
  }

  async capture(item: EventRecordInput) {
    const [record] = await this.repository.insertMany([item]);
    if (record) {
      await new NotificationsService(this.db as DbClient).projectFromEvents([
        {
          id: record.id,
          userId: record.userId,
          appId: record.appId,
          eventName: record.eventName,
          eventTime: record.eventTime,
          properties: record.properties as Record<string, unknown>,
        },
      ]);
    }
    return record;
  }

  async captureMany(items: EventRecordInput[]) {
    const records = await this.repository.insertMany(items);
    if (records.length > 0) {
      await new NotificationsService(this.db as DbClient).projectFromEvents(
        records.map((record) => ({
          id: record.id,
          userId: record.userId,
          appId: record.appId,
          eventName: record.eventName,
          eventTime: record.eventTime,
          properties: record.properties as Record<string, unknown>,
        })),
      );
    }
    return records;
  }
}
