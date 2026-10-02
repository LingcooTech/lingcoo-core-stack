import { decryptJson, encryptJson, type EncryptionKeyring } from '../../lib/settings-crypto';
import { eq } from 'drizzle-orm';
import { appDeliverySettings, deployments } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
export async function deleteAppDeliverySettings(db: DbExecutor, appId: string) {
  await db.delete(appDeliverySettings).where(eq(appDeliverySettings.appId, appId));
}

export async function rotateDeliveryKeyring(
  db: DbExecutor,
  keyring: EncryptionKeyring,
  dryRun: boolean,
) {
  let checked = 0,
    rotated = 0;
  const rows = await db
    .select()
    .from(appDeliverySettings)
    .where(eq(appDeliverySettings.isEncrypted, true))
    .for('update');
  for (const row of rows) {
    checked++;
    const envelope = row.value as { version?: number; keyId?: string };
    const plain = decryptJson(row.value, keyring);
    if (envelope.version === 2 && envelope.keyId === keyring.currentKeyId) continue;
    rotated++;
    if (!dryRun)
      await db
        .update(appDeliverySettings)
        .set({ value: encryptJson(plain, keyring), updatedAt: new Date() })
        .where(eq(appDeliverySettings.appId, row.appId));
  }
  const deploymentRows = await db.select().from(deployments).for('update');
  const rotateNested = (value: unknown): { value: unknown; changed: boolean } => {
    if (!value || typeof value !== 'object') return { value, changed: false };
    if (Array.isArray(value)) {
      const items = value.map(rotateNested);
      return {
        value: items.map((item) => item.value),
        changed: items.some((item) => item.changed),
      };
    }
    const object = value as Record<string, unknown>;
    if (object.alg === 'aes-256-gcm' && [1, 2].includes(Number(object.version))) {
      checked++;
      const plain = decryptJson(object, keyring);
      if (object.version === 2 && object.keyId === keyring.currentKeyId)
        return { value, changed: false };
      rotated++;
      return { value: encryptJson(plain, keyring), changed: true };
    }
    const output: Record<string, unknown> = {};
    let changed = false;
    for (const [key, entry] of Object.entries(object)) {
      const next = rotateNested(entry);
      output[key] = next.value;
      changed ||= next.changed;
    }
    return { value: output, changed };
  };
  for (const row of deploymentRows) {
    const next = rotateNested(row.meta);
    if (next.changed && !dryRun)
      await db
        .update(deployments)
        .set({ meta: next.value, updatedAt: new Date() })
        .where(eq(deployments.id, row.id));
  }
  return { checked, rotated };
}
