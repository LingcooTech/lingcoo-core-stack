import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { migrateCanonicalDelivery } from '../../scripts/migrations/canonical-delivery.mjs';
import cryptoModule from '../../src/lib/settings-crypto.ts';
const { encryptJson, decryptJson, getEncryptionKeys } = cryptoModule;
import helpers from './helpers.ts';
const { seedPurchase, testDatabase } = helpers;
const { db, pool, env } = testDatabase();
after(() => pool.end());
test('delivery upgrade encrypts archives, preserves secrets and is repeatable', async () => {
  const f = await seedPurchase(db);
  const client = await pool.connect();
  try {
    const raw = { frontendImage: 'registry/fixture:1', acrPassword: 'migration-fixture-secret' };
    await client.query('insert into system_settings(key,value,is_encrypted) values($1,$2,true)', [
      `deployment.delivery.${f.app.code}`,
      JSON.stringify(encryptJson(raw, getEncryptionKeys(env))),
    ]);
    await client.query("delete from system_settings where key='migration.delivery-canonical-v1'");
    await migrateCanonicalDelivery(client, process.env);
    const row = (
      await client.query('select * from app_delivery_settings where app_id=$1', [f.app.id])
    ).rows[0];
    assert.equal(row.is_encrypted, true);
    assert.equal(
      decryptJson(row.value, getEncryptionKeys(env)).secrets.ACR_PASSWORD,
      raw.acrPassword,
    );
    const backup = (
      await client.query('select * from system_settings where key=$1', [
        `migration.delivery-backup.${f.app.id}`,
      ])
    ).rows[0];
    assert.equal(backup.is_encrypted, true);
    assert.equal(JSON.stringify(backup.value).includes(raw.acrPassword), false);
    assert.ok(decryptJson(backup.value, getEncryptionKeys(env)).old);
    assert.equal(
      (
        await client.query('select 1 from system_settings where key=$1', [
          `deployment.delivery.${f.app.code}`,
        ])
      ).rowCount,
      0,
    );
    await migrateCanonicalDelivery(client, process.env);
    assert.deepEqual(
      (await client.query('select value from app_delivery_settings where app_id=$1', [f.app.id]))
        .rows[0].value,
      row.value,
    );
  } finally {
    client.release();
  }
});
test('unreadable encrypted delivery data stops the upgrade without partial writes', async () => {
  const f = await seedPurchase(db);
  const client = await pool.connect();
  const key = `deployment.delivery.${f.app.code}`;
  try {
    await client.query('insert into system_settings(key,value,is_encrypted) values($1,$2,true)', [
      key,
      JSON.stringify({
        version: 2,
        alg: 'aes-256-gcm',
        keyId: 'missing-key',
        iv: '',
        tag: '',
        data: '',
      }),
    ]);
    await client.query("delete from system_settings where key='migration.delivery-canonical-v1'");
    await assert.rejects(migrateCanonicalDelivery(client, process.env), /decryption failed/);
    assert.equal(
      (await client.query('select 1 from app_delivery_settings where app_id=$1', [f.app.id]))
        .rowCount,
      0,
    );
    assert.equal(
      (await client.query('select 1 from system_settings where key=$1', [key])).rowCount,
      1,
    );
    assert.equal(
      (
        await client.query(
          "select 1 from system_settings where key='migration.delivery-canonical-v1'",
        )
      ).rowCount,
      0,
    );
  } finally {
    await client.query('delete from system_settings where key=$1', [key]);
    await migrateCanonicalDelivery(client, process.env);
    client.release();
  }
});
