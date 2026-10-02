import { rotateIdempotencyKeyring } from '../idempotency/public';
import { rotateDeliveryKeyring } from '../deployment/public';
import { eq } from 'drizzle-orm';
import { systemSettings } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { decryptJson, encryptJson, getEncryptionKeys } from '../../lib/settings-crypto';
export async function rotateSettingKeys(db: DbExecutor, env: AppEnv, dryRun = true) {
  const keyring = getEncryptionKeys(env);
  return db.transaction(async (tx) => {
    let checked = 0,
      rotated = 0;
    const globals = await tx
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.isEncrypted, true))
      .for('update');

    for (const row of globals) {
      checked++;
      const envelope = row.value as { version?: number; keyId?: string };
      const plain = decryptJson<Record<string, unknown>>(row.value, keyring);
      if (envelope.version === 2 && envelope.keyId === keyring.currentKeyId) continue;
      rotated++;
      if (!dryRun)
        await tx
          .update(systemSettings)
          .set({ value: encryptJson(plain, keyring), updatedAt: new Date() })
          .where(eq(systemSettings.key, row.key));
    }
    const delivery = await rotateDeliveryKeyring(tx, keyring, dryRun);
    const requests = await rotateIdempotencyKeyring(tx, env, dryRun);
    return {
      checked: checked + delivery.checked + requests.checked,
      rotated: rotated + delivery.rotated + requests.rotated,
      dryRun,
      currentKeyId: keyring.currentKeyId,
    };
  });
}
