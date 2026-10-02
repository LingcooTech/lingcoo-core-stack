import { PgTransaction } from 'drizzle-orm/pg-core';
import type { DbExecutor } from './types';
type QueryTask = () => Promise<unknown>;
type Values<T extends readonly QueryTask[]> = {
  -readonly [K in keyof T]: Awaited<ReturnType<T[K]>>;
};

// A transaction owns one connection. Pool-backed reads can run in parallel.
export async function queryBatch<const T extends readonly QueryTask[]>(
  db: DbExecutor,
  tasks: T,
): Promise<Values<T>> {
  if (!(db instanceof PgTransaction))
    return Promise.all(tasks.map((task) => task())) as Promise<Values<T>>;
  const results: unknown[] = [];
  for (const task of tasks) results.push(await task());
  return results as Values<T>;
}
