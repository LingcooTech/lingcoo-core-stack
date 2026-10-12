import type { DbExecutor } from '../db/types';
import type { AppEnv } from '../lib/env';
import { getEncryptionKeys } from '../lib/settings-crypto';
import { rotateGlobalSettingKeys } from '../modules/settings/public';
import { rotateDeliveryKeyring, rotateComposeBindingKeys } from '../modules/deployment/public';
import { rotateIdempotencyKeyring } from '../modules/idempotency/public';
import { rotateApplicationConnectionKeys } from '../modules/app/public';
export async function rotateSettingKeys(db: DbExecutor, env: AppEnv, dryRun = true) {
  return db.transaction(async (tx) => {
    const globals = await rotateGlobalSettingKeys(tx, env, dryRun);
    const delivery = await rotateDeliveryKeyring(tx, getEncryptionKeys(env), dryRun);
    const requests = await rotateIdempotencyKeyring(tx, env, dryRun);
    const connections = await rotateApplicationConnectionKeys(tx, getEncryptionKeys(env), dryRun);
    const compose = await rotateComposeBindingKeys(tx, getEncryptionKeys(env), dryRun);
    return {
      ...globals,
      checked:
        globals.checked +
        delivery.checked +
        requests.checked +
        connections.checked +
        compose.checked,
      rotated:
        globals.rotated +
        delivery.rotated +
        requests.rotated +
        connections.rotated +
        compose.rotated,
    };
  });
}
