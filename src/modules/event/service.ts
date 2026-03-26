import type { DbExecutor } from '../../db/types';
import { EventRepository, type EventRecordInput } from './repository';

export class EventService {
  private readonly repository: EventRepository;

  constructor(db: DbExecutor) {
    this.repository = new EventRepository(db);
  }

  async capture(item: EventRecordInput) {
    const [record] = await this.repository.insertMany([item]);
    return record;
  }

  async captureMany(items: EventRecordInput[]) {
    return this.repository.insertMany(items);
  }
}
