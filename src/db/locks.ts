import { sql } from 'drizzle-orm';
import type { DbExecutor } from './types';

/** Serialize operations sharing a key for the duration of the caller's transaction. */
export async function acquireTransactionLock(db: DbExecutor, key: string): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}
