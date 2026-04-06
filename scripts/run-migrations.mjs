import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const migrationsFolder = path.join(projectRoot, 'drizzle');
const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://fd_core:fd_core_password@localhost:5432/fd_core';

const legacyChecks = {
  '0007_app_content_fields': async (client) => {
    const result = await client.query(`
      select count(*)::int as count
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'apps'
        and column_name = any($1::text[])
    `, [[
      'tagline',
      'content',
      'icon_url',
      'cover_url',
      'screenshots',
      'highlights',
      'faq',
      'links',
      'category',
      'sort_order'
    ]]);

    return result.rows[0]?.count === 10;
  },
  '0008_email_verification': async (client) => {
    const columns = await client.query(`
      select count(*)::int as count
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'users'
        and column_name = any($1::text[])
    `, [['email_verified', 'email_verified_at']]);
    const tables = await client.query(`
      select to_regclass('public.email_verification_codes') is not null as present
    `);

    return columns.rows[0]?.count === 2 && tables.rows[0]?.present === true;
  },
  '0009_domain_model_refactor': async (client) => {
    const state = await client.query(`
      select
        to_regclass('public.app_offers') is not null as has_app_offers,
        to_regclass('public.products') is null as products_removed,
        to_regclass('public.app_products') is null as app_products_removed
    `);

    return (
      state.rows[0]?.has_app_offers === true &&
      state.rows[0]?.products_removed === true &&
      state.rows[0]?.app_products_removed === true
    );
  },
  '0010_app_type_free_text': async (client) => {
    const result = await client.query(`
      select data_type, udt_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'apps'
        and column_name = 'type'
    `);

    const row = result.rows[0];
    return row?.data_type === 'character varying' && row?.udt_name === 'varchar';
  },
  '0011_password_reset_codes': async (client) => {
    const result = await client.query(`
      select to_regclass('public.password_reset_codes') is not null as present
    `);

    return result.rows[0]?.present === true;
  },
  '0012_app_delivery_settings': async (client) => {
    const result = await client.query(`
      select to_regclass('public.app_delivery_settings') is not null as present
    `);

    return result.rows[0]?.present === true;
  },
  '0013_ai_usage_events': async (client) => {
    const result = await client.query(`
      select to_regclass('public.ai_usage_events') is not null as present
    `);

    return result.rows[0]?.present === true;
  }
};

function log(message) {
  console.log(`[db:migrate] ${message}`);
}

async function ensureLegacyMigrationRecords(client) {
  const drizzleTable = await client.query(`
    select to_regclass('drizzle.__drizzle_migrations') as name
  `);

  if (!drizzleTable.rows[0]?.name) {
    log('drizzle.__drizzle_migrations does not exist yet, skipping legacy repair');
    return;
  }

  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  const entries = journal.entries ?? [];
  const recorded = await client.query(`
    select hash from drizzle.__drizzle_migrations
  `);
  const recordedHashes = new Set(recorded.rows.map((row) => row.hash));

  for (const entry of entries) {
    if (!legacyChecks[entry.tag]) {
      continue;
    }

    const sqlPath = path.join(migrationsFolder, `${entry.tag}.sql`);
    const sql = await readFile(sqlPath, 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');

    if (recordedHashes.has(hash)) {
      continue;
    }

    const alreadyApplied = await legacyChecks[entry.tag](client);
    if (!alreadyApplied) {
      log(`stopping legacy repair at ${entry.tag}; migration still needs to run normally`);
      return;
    }

    await client.query(`
      insert into drizzle.__drizzle_migrations (hash, created_at)
      select $1, $2
      where not exists (
        select 1
        from drizzle.__drizzle_migrations
        where hash = $1
      )
    `, [hash, entry.when]);
    recordedHashes.add(hash);
    log(`recorded legacy migration ${entry.tag}`);
  }
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await ensureLegacyMigrationRecords(client);
  } finally {
    await client.end();
  }

  const migrateClient = new Client({ connectionString: databaseUrl });
  await migrateClient.connect();

  try {
    const db = drizzle(migrateClient);
    await migrate(db, { migrationsFolder });
    log('migrations applied successfully');
  } finally {
    await migrateClient.end();
  }
}

main().catch((error) => {
  console.error('[db:migrate] migration failed');
  console.error(error);
  process.exit(1);
});
