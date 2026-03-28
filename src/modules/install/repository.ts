import { desc, eq } from 'drizzle-orm';

import { installs } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class InstallRepository {
  constructor(private readonly db: DbExecutor) {}

  async findInstallById(id: string) {
    const [install] = await this.db.select().from(installs).where(eq(installs.id, id)).limit(1);
    return install ?? null;
  }

  async findInstallByExtensionInstallId(extensionInstallId: string) {
    const [install] = await this.db
      .select()
      .from(installs)
      .where(eq(installs.extensionInstallId, extensionInstallId))
      .limit(1);

    return install ?? null;
  }

  async createInstall(input: {
    userId?: string | null;
    appId: string;
    productId: string;
    extensionInstallId: string;
    deviceFingerprint?: string;
    chromeProfileHint?: string;
    appVersion?: string;
  }) {
    const now = new Date();
    const [install] = await this.db
      .insert(installs)
      .values({
        userId: input.userId ?? null,
        appId: input.appId,
        productId: input.productId,
        extensionInstallId: input.extensionInstallId,
        deviceFingerprint: input.deviceFingerprint ?? null,
        chromeProfileHint: input.chromeProfileHint ?? null,
        appVersion: input.appVersion ?? null,
        status: 'active',
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return install;
  }

  async listRecentInstalls(limit = 50) {
    return this.db.select().from(installs).orderBy(desc(installs.createdAt)).limit(limit);
  }

  async updateInstall(
    installId: string,
    input: {
      userId?: string | null;
      appId?: string | null;
      productId?: string;
      deviceFingerprint?: string | null;
      chromeProfileHint?: string | null;
      appVersion?: string | null;
      lastSeenAt?: Date | null;
      status?: 'active' | 'inactive' | 'cancelled' | 'expired';
    }
  ) {
    const [install] = await this.db
      .update(installs)
      .set({
        userId: input.userId,
        appId: input.appId,
        productId: input.productId,
        deviceFingerprint: input.deviceFingerprint,
        chromeProfileHint: input.chromeProfileHint,
        appVersion: input.appVersion,
        lastSeenAt: input.lastSeenAt,
        status: input.status,
        updatedAt: new Date()
      })
      .where(eq(installs.id, installId))
      .returning();

    return install ?? null;
  }
}
