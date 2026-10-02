import type { DbExecutor } from '../db/types';
import type { AppEnv } from '../lib/env';
import { getEncryptionKeys } from '../lib/settings-crypto';
import { rotateGlobalSettingKeys } from '../modules/settings/public';
import { rotateDeliveryKeyring } from '../modules/deployment/public';
import { rotateIdempotencyKeyring } from '../modules/idempotency/public';
export async function rotateSettingKeys(db: DbExecutor, env: AppEnv, dryRun = true) {
  return db.transaction(async (tx) => {
    const globals = await rotateGlobalSettingKeys(tx, env, dryRun);
    const delivery = await rotateDeliveryKeyring(tx, getEncryptionKeys(env), dryRun);
    const requests = await rotateIdempotencyKeyring(tx, env, dryRun);
    return {
      ...globals,
      checked: globals.checked + delivery.checked + requests.checked,
      rotated: globals.rotated + delivery.rotated + requests.rotated,
    };
  });
}
