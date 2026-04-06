import type { DbClient } from '../db/types';

type QueryCapableClient = {
  query: (
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

type DbWithClient = DbClient & {
  $client?: QueryCapableClient;
};

export async function hasPublicTable(db: DbClient, tableName: string) {
  const client = (db as DbWithClient).$client;
  if (!client || typeof client.query !== 'function') {
    return true;
  }

  const result = await client.query(
    'select to_regclass($1) as regclass',
    [`public.${tableName}`]
  );

  return Boolean(result.rows[0]?.regclass);
}
