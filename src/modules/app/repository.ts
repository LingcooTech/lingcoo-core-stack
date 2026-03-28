import { desc, eq, inArray } from 'drizzle-orm';

import { appProducts, apps, appSecrets } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class AppRepository {
  constructor(private readonly db: DbExecutor) {}

  async listApps() {
    return this.db.select().from(apps).orderBy(desc(apps.createdAt));
  }

  async findAppByCode(code: string) {
    const [app] = await this.db.select().from(apps).where(eq(apps.code, code)).limit(1);
    return app ?? null;
  }

  async findAppById(id: string) {
    const [app] = await this.db.select().from(apps).where(eq(apps.id, id)).limit(1);
    return app ?? null;
  }

  async upsertApp(input: {
    code: string;
    name: string;
    description?: string;
    type: 'chrome_extension' | 'web_app' | 'service';
    status: 'active' | 'inactive' | 'cancelled' | 'expired';
    meta?: Record<string, unknown>;
  }) {
    const now = new Date();
    const [app] = await this.db
      .insert(apps)
      .values({
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        status: input.status,
        meta: input.meta ?? {},
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: apps.code,
        set: {
          name: input.name,
          description: input.description ?? null,
          type: input.type,
          status: input.status,
          meta: input.meta ?? {},
          updatedAt: now
        }
      })
      .returning();

    return app;
  }

  async listProductMappingsByAppIds(appIds: string[]) {
    if (appIds.length === 0) {
      return [];
    }

    return this.db.select().from(appProducts).where(inArray(appProducts.appId, appIds));
  }

  async replaceAppProducts(appId: string, productIds: string[]) {
    await this.db.delete(appProducts).where(eq(appProducts.appId, appId));

    if (productIds.length === 0) {
      return;
    }

    await this.db.insert(appProducts).values(
      productIds.map((productId) => ({
        appId,
        productId,
        createdAt: new Date()
      }))
    );
  }

  async createAppSecret(input: {
    appId: string;
    name: string;
    secretHash: string;
    hint: string;
    expiresAt?: Date | null;
  }) {
    const [secret] = await this.db
      .insert(appSecrets)
      .values({
        appId: input.appId,
        name: input.name,
        secretHash: input.secretHash,
        hint: input.hint,
        expiresAt: input.expiresAt ?? null,
        createdAt: new Date()
      })
      .returning();

    return secret;
  }

  async listAppSecretsByAppIds(appIds: string[]) {
    if (appIds.length === 0) {
      return [];
    }

    return this.db.select().from(appSecrets).where(inArray(appSecrets.appId, appIds));
  }

  async findAppSecretById(id: string) {
    const [secret] = await this.db.select().from(appSecrets).where(eq(appSecrets.id, id)).limit(1);
    return secret ?? null;
  }

  async markAppSecretUsed(id: string) {
    const [secret] = await this.db
      .update(appSecrets)
      .set({
        lastUsedAt: new Date()
      })
      .where(eq(appSecrets.id, id))
      .returning();

    return secret ?? null;
  }
}
