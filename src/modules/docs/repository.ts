import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { docFeedback, docPages, docSpaces } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class DocsRepository {
  constructor(private readonly db: DbExecutor) {}

  async listSpaces(query?: { search?: string }) {
    const conditions = [];

    if (query?.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(docSpaces.title, pattern),
          ilike(docSpaces.slug, pattern),
          ilike(docSpaces.description, pattern),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return this.db
      .select()
      .from(docSpaces)
      .where(where)
      .orderBy(asc(docSpaces.sortOrder), asc(docSpaces.title));
  }

  async listPublicSpaces() {
    return this.db
      .select()
      .from(docSpaces)
      .where(eq(docSpaces.status, 'active'))
      .orderBy(asc(docSpaces.sortOrder), asc(docSpaces.title));
  }

  async findSpaceById(id: string) {
    const [space] = await this.db.select().from(docSpaces).where(eq(docSpaces.id, id)).limit(1);
    return space ?? null;
  }

  async findSpaceBySlug(slug: string) {
    const [space] = await this.db.select().from(docSpaces).where(eq(docSpaces.slug, slug)).limit(1);
    return space ?? null;
  }

  async listPagesBySpace(spaceId: string) {
    return this.db
      .select()
      .from(docPages)
      .where(eq(docPages.spaceId, spaceId))
      .orderBy(asc(docPages.path), asc(docPages.sortOrder), asc(docPages.title));
  }

  async findPageById(id: string) {
    const [page] = await this.db.select().from(docPages).where(eq(docPages.id, id)).limit(1);
    return page ?? null;
  }

  async findPageByPath(spaceId: string, path: string) {
    const [page] = await this.db
      .select()
      .from(docPages)
      .where(and(eq(docPages.spaceId, spaceId), eq(docPages.path, path)))
      .limit(1);
    return page ?? null;
  }

  async countPagesBySpace(spaceId: string) {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(docPages)
      .where(eq(docPages.spaceId, spaceId));
    return result?.count ?? 0;
  }

  async createSpace(input: typeof docSpaces.$inferInsert) {
    const [space] = await this.db.insert(docSpaces).values(input).returning();
    return space;
  }

  async updateSpace(id: string, input: Partial<typeof docSpaces.$inferInsert>) {
    const [space] = await this.db
      .update(docSpaces)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(docSpaces.id, id))
      .returning();
    return space ?? null;
  }

  async createPage(input: typeof docPages.$inferInsert) {
    const [page] = await this.db.insert(docPages).values(input).returning();
    return page;
  }

  async updatePage(id: string, input: Partial<typeof docPages.$inferInsert>) {
    const [page] = await this.db
      .update(docPages)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(docPages.id, id))
      .returning();
    return page ?? null;
  }

  async createFeedback(input: typeof docFeedback.$inferInsert) {
    const [row] = await this.db.insert(docFeedback).values(input).returning();
    return row;
  }

  async listFeedbackByPage(spaceSlug: string, pagePath: string, limit = 50) {
    return this.db
      .select()
      .from(docFeedback)
      .where(and(eq(docFeedback.spaceSlug, spaceSlug), eq(docFeedback.pagePath, pagePath)))
      .orderBy(desc(docFeedback.createdAt))
      .limit(limit);
  }
}
