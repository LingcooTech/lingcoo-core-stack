import { eq } from 'drizzle-orm';
import { appDeliverySettings } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
export async function deleteAppDeliverySettings(db: DbExecutor, appId: string) {
  await db.delete(appDeliverySettings).where(eq(appDeliverySettings.appId, appId));
}
