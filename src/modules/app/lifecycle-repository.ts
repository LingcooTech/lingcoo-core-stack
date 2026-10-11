import { and, desc, eq } from 'drizzle-orm';
import { appConnections, appSources, appReleases } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class AppLifecycleRepository {
  constructor(private readonly db: DbExecutor) {}
  listConnections() {
    return this.db.select().from(appConnections).orderBy(desc(appConnections.createdAt));
  }
  async connection(id: string) {
    return (
      await this.db.select().from(appConnections).where(eq(appConnections.id, id)).limit(1)
    )[0];
  }
  async createConnection(values: typeof appConnections.$inferInsert) {
    return (await this.db.insert(appConnections).values(values).returning())[0]!;
  }
  deleteConnection(id: string) {
    return this.db.delete(appConnections).where(eq(appConnections.id, id));
  }
  async source(appId: string) {
    return (await this.db.select().from(appSources).where(eq(appSources.appId, appId)).limit(1))[0];
  }
  async saveSource(values: typeof appSources.$inferInsert) {
    return this.db
      .insert(appSources)
      .values(values)
      .onConflictDoUpdate({ target: appSources.appId, set: { ...values, updatedAt: new Date() } });
  }
  releases(appId: string) {
    return this.db
      .select()
      .from(appReleases)
      .where(eq(appReleases.appId, appId))
      .orderBy(desc(appReleases.createdAt));
  }
  async release(appId: string, id: string) {
    return (
      await this.db
        .select()
        .from(appReleases)
        .where(and(eq(appReleases.appId, appId), eq(appReleases.id, id)))
        .limit(1)
    )[0];
  }
  async byVersion(appId: string, version: string) {
    return (
      await this.db
        .select()
        .from(appReleases)
        .where(and(eq(appReleases.appId, appId), eq(appReleases.version, version)))
        .limit(1)
    )[0];
  }
  async createRelease(values: typeof appReleases.$inferInsert) {
    return (await this.db.insert(appReleases).values(values).returning())[0]!;
  }
  async setReleaseStatus(id: string, status: string) {
    return (
      await this.db
        .update(appReleases)
        .set({ status, ...(status === 'published' ? { publishedAt: new Date() } : {}) })
        .where(eq(appReleases.id, id))
        .returning()
    )[0]!;
  }
}
