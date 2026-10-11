import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../../db/types';
import { appConnections } from '../../db/schema';
import { encryptJson, decryptJson, type EncryptionKeyring } from '../../lib/settings-crypto';
export async function rotateApplicationConnectionKeys(
  db: DbExecutor,
  keyring: EncryptionKeyring,
  dryRun: boolean,
) {
  let checked = 0,
    rotated = 0;
  for (const row of await db.select().from(appConnections).for('update')) {
    checked++;
    const envelope = row.credentials as { version?: number; keyId?: string };
    const plain = decryptJson(row.credentials, keyring);
    if (envelope.version === 2 && envelope.keyId === keyring.currentKeyId) continue;
    rotated++;
    if (!dryRun)
      await db
        .update(appConnections)
        .set({ credentials: encryptJson(plain, keyring) })
        .where(eq(appConnections.id, row.id));
  }
  return { checked, rotated };
}
