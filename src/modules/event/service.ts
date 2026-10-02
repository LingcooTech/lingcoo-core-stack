import { createHash } from 'node:crypto';
import type { ServiceFactories } from '../../composition/service-factories';
import type { DbExecutor } from '../../db/types';
import { JobRunService } from '../jobs/public';
import { EventRepository, type EventRecordInput } from './repository';
export class EventService {
  constructor(
    private readonly capabilities: ServiceFactories,
    private readonly db: DbExecutor,
  ) {}
  async capture(item: EventRecordInput) {
    const records = await this.captureMany([item]);
    return records[0];
  }
  async captureMany(items: EventRecordInput[]) {
    return this.db.transaction(async (tx) => {
      const records = await new EventRepository(tx).insertMany(items);
      const ids = records.filter((record) => record.userId).map((record) => record.id);
      for (let offset = 0; offset < ids.length; offset += 100) {
        const eventIds = ids.slice(offset, offset + 100);
        await new JobRunService(tx).enqueue({
          kind: 'notifications.project',
          payload: { eventIds },
          dedupeKey: `notifications:${createHash('sha256').update(eventIds.join(':')).digest('hex')}`,
        });
      }
      return records;
    });
  }
  async loadProjectionEvents(ids: string[]) {
    return new EventRepository(this.db).findByIds(ids);
  }
}
