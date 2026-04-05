import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';

import { apps, installs, users } from '../../db/schema';
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

  async listInstalls(query: {
    limit: number;
    offset: number;
    search?: string;
  }) {
    const conditions = [];

    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(installs.extensionInstallId, pattern),
          ilike(installs.chromeProfileHint, pattern),
          ilike(installs.appVersion, pattern),
          ilike(installs.status, pattern),
          ilike(users.email, pattern),
          ilike(users.displayName, pattern),
          ilike(apps.code, pattern),
          ilike(apps.name, pattern)
        )!
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      this.db
        .select({ item: installs })
        .from(installs)
        .leftJoin(users, eq(installs.userId, users.id))
        .leftJoin(apps, eq(installs.appId, apps.id))
        .where(where)
        .orderBy(desc(installs.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(installs)
        .leftJoin(users, eq(installs.userId, users.id))
        .leftJoin(apps, eq(installs.appId, apps.id))
        .where(where)
    ]);

    return {
      items: rows.map((row) => row.item),
      total: countResult[0]?.count ?? 0,
    };
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
      appId?: string;
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
