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

  async listAppsByIds(appIds: string[]) {
    if (appIds.length === 0) {
      return [];
    }

    return this.db.select().from(apps).where(inArray(apps.id, appIds));
  }

  async upsertApp(input: {
    code: string;
    name: string;
    tagline?: string;
    description?: string;
    content?: string;
    iconUrl?: string;
    coverUrl?: string;
    screenshots?: unknown[];
    highlights?: unknown[];
    faq?: unknown[];
    links?: unknown[];
    category?: string;
    sortOrder?: number;
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
        tagline: input.tagline ?? null,
        description: input.description ?? null,
        content: input.content ?? null,
        iconUrl: input.iconUrl ?? null,
        coverUrl: input.coverUrl ?? null,
        screenshots: input.screenshots ?? [],
        highlights: input.highlights ?? [],
        faq: input.faq ?? [],
        links: input.links ?? [],
        category: input.category ?? null,
        sortOrder: input.sortOrder ?? 0,
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
          tagline: input.tagline ?? null,
          description: input.description ?? null,
          content: input.content ?? null,
          iconUrl: input.iconUrl ?? null,
          coverUrl: input.coverUrl ?? null,
          screenshots: input.screenshots ?? [],
          highlights: input.highlights ?? [],
          faq: input.faq ?? [],
          links: input.links ?? [],
          category: input.category ?? null,
          sortOrder: input.sortOrder ?? 0,
          type: input.type,
          status: input.status,
          meta: input.meta ?? {},
          updatedAt: now
        }
      })
      .returning();

    return app;
  }

  async updateAppMetaByCode(code: string, meta: Record<string, unknown>) {
    const [app] = await this.db
      .update(apps)
      .set({
        meta,
        updatedAt: new Date()
      })
      .where(eq(apps.code, code))
      .returning();

    return app ?? null;
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

  async updateAppSecretStatus(id: string, status: 'active' | 'inactive' | 'cancelled' | 'expired') {
    const [secret] = await this.db
      .update(appSecrets)
      .set({
        status
      })
      .where(eq(appSecrets.id, id))
      .returning();

    return secret ?? null;
  }
}
