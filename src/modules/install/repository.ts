import { desc, eq, inArray } from 'drizzle-orm';

import { installs } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class InstallRepository {
  constructor(private readonly db: DbExecutor) {}

  async findInstallById(id: string) {
    const [install] = await this.db.select().from(installs).where(eq(installs.id, id)).limit(1);
    return install ?? null;
  }

  async findInstallByInstanceCode(instanceCode: string) {
    const [install] = await this.db
      .select()
      .from(installs)
      .where(eq(installs.instanceCode, instanceCode))
      .limit(1);

    return install ?? null;
  }

  async createInstall(input: {
    userId?: string | null;
    appId: string;
    productId: string;
    instanceCode: string;
    deviceFingerprint?: string;
    profileHint?: string;
    clientVersion?: string;
    meta?: Record<string, unknown>;
  }) {
    const now = new Date();
    const [install] = await this.db
      .insert(installs)
      .values({
        userId: input.userId ?? null,
        appId: input.appId,
        productId: input.productId,
        instanceCode: input.instanceCode,
        deviceFingerprint: input.deviceFingerprint ?? null,
        profileHint: input.profileHint ?? null,
        clientVersion: input.clientVersion ?? null,
        meta: input.meta ?? {},
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

  async listInstallsByIds(installIds: string[]) {
    if (installIds.length === 0) {
      return [];
    }

    return this.db.select().from(installs).where(inArray(installs.id, installIds));
  }

  async updateInstall(
    installId: string,
    input: {
      userId?: string | null;
      appId?: string | null;
      productId?: string;
      deviceFingerprint?: string | null;
      profileHint?: string | null;
      clientVersion?: string | null;
      meta?: Record<string, unknown>;
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
        profileHint: input.profileHint,
        clientVersion: input.clientVersion,
        meta: input.meta,
        lastSeenAt: input.lastSeenAt,
        status: input.status,
        updatedAt: new Date()
      })
      .where(eq(installs.id, installId))
      .returning();

    return install ?? null;
  }
}
