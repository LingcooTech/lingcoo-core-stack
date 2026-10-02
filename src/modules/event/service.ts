import type { ServiceFactories } from '../../composition/service-factories';
import type { DbExecutor } from '../../db/types';
import { EventRepository, type EventRecordInput } from './repository';

export class EventService {
  private readonly repository: EventRepository;
  private readonly db: DbExecutor;

  constructor(
    private readonly capabilities: ServiceFactories,
    db: DbExecutor,
  ) {
    this.db = db;
    this.repository = new EventRepository(db);
  }

  async capture(item: EventRecordInput) {
    const [record] = await this.repository.insertMany([item]);
    if (record) {
      await this.capabilities.createNotificationsService(this.db).projectFromEvents([
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
      await this.capabilities.createNotificationsService(this.db).projectFromEvents(
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
