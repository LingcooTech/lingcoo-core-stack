import { and, desc, eq, inArray } from 'drizzle-orm';

import { appOffers, apps, appSecrets } from '../../db/schema';
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
    type: string;
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
      .set({ meta, updatedAt: new Date() })
      .where(eq(apps.code, code))
      .returning();

    return app ?? null;
  }

  async updateAppById(
    appId: string,
    input: Partial<{
      name: string;
      tagline: string | null;
      description: string | null;
      content: string | null;
      iconUrl: string | null;
      coverUrl: string | null;
      screenshots: unknown[];
      highlights: unknown[];
      faq: unknown[];
      links: unknown[];
      category: string | null;
      sortOrder: number;
      type: string;
      status: 'active' | 'inactive' | 'cancelled' | 'expired';
      meta: Record<string, unknown>;
    }>
  ) {
    const [app] = await this.db
      .update(apps)
      .set({
        ...input,
        updatedAt: new Date()
      })
      .where(eq(apps.id, appId))
      .returning();

    return app ?? null;
  }

  async listOffersByAppId(appId: string) {
    return this.db
      .select()
      .from(appOffers)
      .where(eq(appOffers.appId, appId))
      .orderBy(appOffers.sortOrder);
  }

  async listOffersByAppIds(appIds: string[]) {
    if (appIds.length === 0) {
      return [];
    }

    return this.db.select().from(appOffers).where(inArray(appOffers.appId, appIds));
  }

  async findOfferByAppIdAndCode(appId: string, code: string) {
    const [offer] = await this.db
      .select()
      .from(appOffers)
      .where(and(eq(appOffers.appId, appId), eq(appOffers.code, code)))
      .limit(1);

    return offer ?? null;
  }

  async replaceAppOffers(
    appId: string,
    offers: Array<{
      planId: string;
      code: string;
      title: string;
      description?: string | null;
      badge?: string | null;
      priceAmount: number;
      currency: string;
      isDefault: boolean;
      sortOrder: number;
      status: 'active' | 'inactive' | 'cancelled' | 'expired';
    }>
  ) {
    await this.db.delete(appOffers).where(eq(appOffers.appId, appId));

    if (offers.length === 0) {
      return [];
    }

    const now = new Date();
    return this.db
      .insert(appOffers)
      .values(
        offers.map((offer) => ({
          appId,
          planId: offer.planId,
          code: offer.code,
          title: offer.title,
          description: offer.description ?? null,
          badge: offer.badge ?? null,
          priceAmount: offer.priceAmount,
          currency: offer.currency,
          isDefault: offer.isDefault,
          sortOrder: offer.sortOrder,
          status: offer.status,
          createdAt: now,
          updatedAt: now
        }))
      )
      .returning();
  }

  async deleteAppOffersByAppId(appId: string) {
    return this.db.delete(appOffers).where(eq(appOffers.appId, appId)).returning();
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

  async deleteAppSecretsByAppId(appId: string) {
    return this.db.delete(appSecrets).where(eq(appSecrets.appId, appId)).returning();
  }
}
