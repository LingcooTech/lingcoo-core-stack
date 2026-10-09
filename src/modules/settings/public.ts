import { eq } from 'drizzle-orm';
import { systemSettings } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
export async function deleteLegacyDeliverySettings(db: DbExecutor, appCode: string) {
  await db.delete(systemSettings).where(eq(systemSettings.key, `deployment.delivery.${appCode}`));
}
export async function findLegacyDeliverySettings(db: DbExecutor, appCode: string) {
  const [row] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, `deployment.delivery.${appCode}`))
    .limit(1);
  return row ?? null;
}
export async function saveLegacyDeliverySettings(
  db: DbExecutor,
  appCode: string,
  value: unknown,
  updatedByUserId: string,
) {
  const now = new Date();
  await db
    .insert(systemSettings)
    .values({
      key: `deployment.delivery.${appCode}`,
      value,
      isEncrypted: true,
      updatedByUserId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, isEncrypted: true, updatedByUserId, updatedAt: now },
    });
}
export { SettingsRegistry, settingDefinitions, settingsKeyForPath } from './registry';

export { rotateGlobalSettingKeys } from './key-rotation';

export * from './schemas';

export * from './infrastructure/qiniu-settings';

export * from './infrastructure/alerting-settings';

export * from './infrastructure/openrouter-settings';

export * from './infrastructure/public-pages-settings';

export * from './infrastructure/payment-settings';

export * from './infrastructure/content-import-settings';

export * from './infrastructure/site-settings';

export * from './infrastructure/smtp-settings';

export * from './infrastructure/storage-settings';
