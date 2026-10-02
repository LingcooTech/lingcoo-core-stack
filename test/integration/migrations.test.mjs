import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { migrateDatabase } from '../../scripts/run-migrations.mjs';
const source = path.resolve('drizzle');
const journal = JSON.parse(await readFile(path.join(source, 'meta/_journal.json'), 'utf8'));
async function fixture(work) {
  const url = new URL(process.env.DATABASE_TEST_URL);
  assert(url.pathname.endsWith('_test'));
  const name = 'migration_' + randomUUID().replaceAll('-', '') + '_test';
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  const folder = await mkdtemp(path.join(tmpdir(), 'stack-migrations-'));
  let client;
  try {
    await admin.query(`create database "${name}"`);
    url.pathname = '/' + name;
    client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    await mkdir(path.join(folder, 'meta'));
    const baseline = { ...journal, entries: journal.entries.slice(0, 24) };
    await writeFile(path.join(folder, 'meta/_journal.json'), JSON.stringify(baseline));
    for (const entry of baseline.entries)
      await copyFile(path.join(source, entry.tag + '.sql'), path.join(folder, entry.tag + '.sql'));
    await work({ url: url.toString(), client, folder });
  } finally {
    await client?.end();
    await admin.query(`drop database if exists "${name}" with (force)`);
    await admin.end();
    await rm(folder, { recursive: true, force: true });
  }
}
test('baseline upgrade, legacy record repair and simultaneous migrations preserve history', async () => {
  await fixture(async ({ url, client, folder }) => {
    await migrateDatabase(url, folder);
    const count = (
      await client.query('select count(*)::int as n from drizzle.__drizzle_migrations')
    ).rows[0].n;
    assert.equal(count, 24);
    for (const entry of journal.entries.slice(7, 14)) {
      const hash = createHash('sha256')
        .update(await readFile(path.join(source, entry.tag + '.sql')))
        .digest('hex');
      await client.query('delete from drizzle.__drizzle_migrations where hash=$1', [hash]);
    }
    await Promise.all([migrateDatabase(url), migrateDatabase(url)]);
    await migrateDatabase(url);
    assert.equal(
      (await client.query('select count(*)::int as n from drizzle.__drizzle_migrations')).rows[0].n,
      journal.entries.length,
    );
    assert(
      (await client.query("select to_regclass('public.idempotency_requests') as name")).rows[0]
        .name,
    );
  });
});
test('legacy repair refuses a missing migration when schema proof is incomplete', async () => {
  await fixture(async ({ url, client, folder }) => {
    await migrateDatabase(url, folder);
    const entry = journal.entries[7];
    const hash = createHash('sha256')
      .update(await readFile(path.join(source, entry.tag + '.sql')))
      .digest('hex');
    await client.query('delete from drizzle.__drizzle_migrations where hash=$1', [hash]);
    await client.query('alter table apps drop column tagline');
    await assert.rejects(migrateDatabase(url), /schema proof failed/);
    assert.equal(
      (await client.query('select count(*)::int as n from drizzle.__drizzle_migrations')).rows[0].n,
      23,
    );
  });
});
