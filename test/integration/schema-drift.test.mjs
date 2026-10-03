import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrateDatabase } from '../../scripts/run-migrations.mjs';
const require = createRequire(import.meta.url);
const { generateDrizzleJson, generateMigration } = require('drizzle-kit/api');
const queries = {
  columns: `select c.relname as table_name, a.attname as column_name, format_type(a.atttypid,a.atttypmod) as type, a.attnotnull as not_null, pg_get_expr(d.adbin,d.adrelid) as default_value from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped order by c.relname,a.attname`,
  constraints: `select c.relname as table_name, k.conname as name, k.contype as kind, k.convalidated as validated, pg_get_constraintdef(k.oid) as definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname,k.contype,pg_get_constraintdef(k.oid)`,
  indexes: `select c.relname as table_name, i.indexrelid::regclass::text as name, i.indisunique as unique, substring(pg_get_indexdef(i.indexrelid) from ' USING .*') as definition from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname,i.indisunique,substring(pg_get_indexdef(i.indexrelid) from ' USING .*')`,
  enums: `select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as values from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' group by t.typname order by t.typname`,
};

test('historical migrations and current schema generate identical PostgreSQL structures', async () => {
  const url = new URL(process.env.DATABASE_TEST_URL);
  assert(url.pathname.endsWith('_test'));
  const admin = new pg.Client({ connectionString: url.toString() });
  const names = ['actual', 'expected'].map(
    (x) => `schema_${x}_${randomUUID().replaceAll('-', '')}_test`,
  );
  const clients = [];
  await admin.connect();
  try {
    for (const name of names) {
      await admin.query(`create database "${name}"`);
      const u = new URL(url);
      u.pathname = '/' + name;
      const client = new pg.Client({ connectionString: u.toString() });
      await client.connect();
      clients.push(client);
    }
    const migrated = new URL(url);
    migrated.pathname = '/' + names[0];
    await migrateDatabase(migrated.toString());
    const sql = await generateMigration(
      generateDrizzleJson({}),
      generateDrizzleJson(require('../../src/db/schema.ts')),
    );
    for (const statement of sql) await clients[1].query(statement);
    for (const [kind, query] of Object.entries(queries)) {
      const results = await Promise.all(
        clients.map(async (client) =>
          (await client.query(query)).rows.map((row) => JSON.stringify(row)).sort(),
        ),
      );
      assert.deepEqual(results[0], results[1], `${kind} drift between migrations and schema`);
    }
  } finally {
    for (const client of clients) await client.end();
    for (const name of names) await admin.query(`drop database if exists "${name}" with (force)`);
    await admin.end();
  }
});
