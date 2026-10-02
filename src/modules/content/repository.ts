import { queryBatch } from '../../db/query-batch';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { contentItems } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class ContentRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: string) {
    const [item] = await this.db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, id))
      .limit(1);
    return item ?? null;
  }

  async findBySlug(slug: string) {
    const [item] = await this.db
      .select()
      .from(contentItems)
      .where(eq(contentItems.slug, slug))
      .limit(1);
    return item ?? null;
  }

  async findBySource(input: {
    sourceType: 'manual' | 'wordpress' | 'notion' | 'wechat';
    sourceId?: string | null;
    sourceUrl?: string | null;
  }) {
    if (input.sourceId?.trim()) {
      const [item] = await this.db
        .select()
        .from(contentItems)
        .where(
          and(
            eq(contentItems.sourceType, input.sourceType),
            eq(contentItems.sourceId, input.sourceId.trim()),
          ),
        )
        .limit(1);
      if (item) {
        return item;
      }
    }

    if (input.sourceUrl?.trim()) {
      const [item] = await this.db
        .select()
        .from(contentItems)
        .where(
          and(
            eq(contentItems.sourceType, input.sourceType),
            eq(contentItems.sourceUrl, input.sourceUrl.trim()),
          ),
        )
        .limit(1);
      return item ?? null;
    }

    return null;
  }

  async listContent(query: {
    limit: number;
    offset: number;
    search?: string;
    status?: 'draft' | 'published' | 'archived';
    sourceType?: 'manual' | 'wordpress' | 'notion' | 'wechat';
  }) {
    const conditions = [];

    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(contentItems.title, pattern),
          ilike(contentItems.slug, pattern),
          ilike(contentItems.excerpt, pattern),
          ilike(contentItems.authorName, pattern),
          ilike(contentItems.sourceUrl, pattern),
        )!,
      );
    }

    if (query.status) {
      conditions.push(eq(contentItems.status, query.status));
    }

    if (query.sourceType) {
      conditions.push(eq(contentItems.sourceType, query.sourceType));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await queryBatch(this.db, [
      () =>
        this.db
          .select()
          .from(contentItems)
          .where(where)
          .orderBy(
            desc(contentItems.publishedAt),
            desc(contentItems.importedAt),
            desc(contentItems.createdAt),
          )
          .limit(query.limit)
          .offset(query.offset),
      () =>
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(contentItems)
          .where(where),
    ]);

    return {
      items,
      total: countResult[0]?.count ?? 0,
    };
  }

  async listPublishedContent(query: { limit: number; offset: number; search?: string }) {
    const conditions = [eq(contentItems.status, 'published')];

    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(contentItems.title, pattern),
          ilike(contentItems.slug, pattern),
          ilike(contentItems.excerpt, pattern),
          ilike(contentItems.authorName, pattern),
        )!,
      );
    }

    const where = and(...conditions);

    const [items, countResult] = await queryBatch(this.db, [
      () =>
        this.db
          .select()
          .from(contentItems)
          .where(where)
          .orderBy(desc(contentItems.publishedAt), desc(contentItems.updatedAt))
          .limit(query.limit)
          .offset(query.offset),
      () =>
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(contentItems)
          .where(where),
    ]);

    return {
      items,
      total: countResult[0]?.count ?? 0,
    };
  }

  async create(input: typeof contentItems.$inferInsert) {
    const [item] = await this.db.insert(contentItems).values(input).returning();
    if (!item) throw new Error('Missing required write result: content item');
    return item;
  }

  async update(id: string, input: Partial<typeof contentItems.$inferInsert>) {
    const [item] = await this.db
      .update(contentItems)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, id))
      .returning();

    return item ?? null;
  }
}
