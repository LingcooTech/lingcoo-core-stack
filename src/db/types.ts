import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type * as schema from './schema';

export type DbClient = NodePgDatabase<typeof schema>;
export type DbExecutor = Pick<DbClient, 'select' | 'insert' | 'update' | 'delete'>;
