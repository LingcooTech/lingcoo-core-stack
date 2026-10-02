import { sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/types';
export async function hasPublicTable(db: DbExecutor, tableName: string) {
  const result = await db.execute<{ regclass: string | null }>(
    sql`select to_regclass(${`public.${tableName}`}) as regclass`,
  );
  return Boolean(result.rows[0]?.regclass);
}
