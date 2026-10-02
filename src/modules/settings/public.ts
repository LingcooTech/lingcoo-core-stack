import { eq } from 'drizzle-orm';
import { systemSettings } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
export async function deleteLegacyDeliverySettings(db: DbExecutor, appCode: string) {
  await db.delete(systemSettings).where(eq(systemSettings.key, `deployment.delivery.${appCode}`));
}
export { SettingsRegistry, settingDefinitions, settingsKeyForPath } from './registry';

export { rotateSettingKeys } from './key-rotation';

export * from './schemas';
