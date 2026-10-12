import { and, desc, eq, or } from 'drizzle-orm';
import {
  appConnections,
  developmentProjects,
  apps,
  appSources,
  appReleases,
  appPublishingTokens,
  appBuildRequests,
} from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class AppLifecycleRepository {
  constructor(private readonly db: DbExecutor) {}
  projects() {
    return this.db.select().from(developmentProjects).orderBy(desc(developmentProjects.updatedAt));
  }
  async project(code: string) {
    return (
      await this.db
        .select()
        .from(developmentProjects)
        .where(eq(developmentProjects.code, code))
        .limit(1)
    )[0];
  }
  async projectById(id: string) {
    return (
      await this.db
        .select()
        .from(developmentProjects)
        .where(eq(developmentProjects.id, id))
        .limit(1)
    )[0];
  }
  async createProject(values: typeof developmentProjects.$inferInsert) {
    return (await this.db.insert(developmentProjects).values(values).returning())[0]!;
  }
  async owner(code: string) {
    const existing = await this.project(code);
    if (existing) return existing;
    // Compatibility for applications created by older API clients after the migration.
    const app = (await this.db.select().from(apps).where(eq(apps.code, code)).limit(1))[0];
    if (!app) return undefined;
    const source = (
      await this.db.select().from(appSources).where(eq(appSources.appId, app.id)).limit(1)
    )[0];
    await this.db
      .insert(developmentProjects)
      .values({
        id: app.id,
        code,
        name: app.name,
        appId: app.id,
        source: source?.source,
        definition: source?.definition,
        definitionDigest: source?.definitionDigest,
      })
      .onConflictDoNothing();
    return this.project(code);
  }
  async linkProduct(projectId: string, appId: string) {
    await this.db
      .update(developmentProjects)
      .set({ appId, updatedAt: new Date() })
      .where(eq(developmentProjects.id, projectId));
    await this.db.update(appReleases).set({ appId }).where(eq(appReleases.projectId, projectId));
  }
  async connectionReferences(id: string) {
    return (await this.projects())
      .filter((p) => (p.source as { connectionId?: string } | null)?.connectionId === id)
      .map((p) => ({ code: p.code, name: p.name }));
  }
  async currentPublishedRelease(appId: string) {
    return (
      await this.db
        .select()
        .from(appReleases)
        .where(and(eq(appReleases.appId, appId), eq(appReleases.status, 'published')))
        .orderBy(desc(appReleases.publishedAt), desc(appReleases.createdAt))
        .limit(1)
    )[0];
  }
  tokens(appId: string) {
    return this.db
      .select()
      .from(appPublishingTokens)
      .where(or(eq(appPublishingTokens.projectId, appId), eq(appPublishingTokens.appId, appId)))
      .orderBy(desc(appPublishingTokens.createdAt));
  }
  async token(hash: string) {
    return (
      await this.db
        .select()
        .from(appPublishingTokens)
        .where(eq(appPublishingTokens.tokenHash, hash))
        .limit(1)
    )[0];
  }
  async createPublishingToken(values: typeof appPublishingTokens.$inferInsert) {
    return (await this.db.insert(appPublishingTokens).values(values).returning())[0]!;
  }
  revokeToken(appId: string, id: string) {
    return this.db
      .update(appPublishingTokens)
      .set({ revoked: true })
      .where(
        and(
          or(eq(appPublishingTokens.projectId, appId), eq(appPublishingTokens.appId, appId)),
          eq(appPublishingTokens.id, id),
        ),
      );
  }
  builds(appId: string) {
    return this.db
      .select()
      .from(appBuildRequests)
      .where(or(eq(appBuildRequests.projectId, appId), eq(appBuildRequests.appId, appId)))
      .orderBy(desc(appBuildRequests.createdAt))
      .limit(30);
  }
  async build(id: string) {
    return (
      await this.db.select().from(appBuildRequests).where(eq(appBuildRequests.id, id)).limit(1)
    )[0];
  }
  async createBuild(values: typeof appBuildRequests.$inferInsert) {
    return (await this.db.insert(appBuildRequests).values(values).returning())[0]!;
  }
  async setBuildStatus(id: string, status: string) {
    return (
      await this.db
        .update(appBuildRequests)
        .set({ status })
        .where(eq(appBuildRequests.id, id))
        .returning()
    )[0]!;
  }
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
  async source(ownerId: string) {
    const project = await this.projectById(ownerId);
    if (project?.definition)
      return {
        appId: project.id,
        source: project.source,
        definition: project.definition,
        definitionDigest: project.definitionDigest!,
      };
    return (
      await this.db.select().from(appSources).where(eq(appSources.appId, ownerId)).limit(1)
    )[0];
  }
  async saveSource(values: typeof appSources.$inferInsert) {
    const project = await this.projectById(values.appId);
    if (!project) throw new Error('Development project required');
    await this.db
      .update(developmentProjects)
      .set({
        source: values.source,
        definition: values.definition,
        definitionDigest: values.definitionDigest,
        updatedAt: new Date(),
      })
      .where(eq(developmentProjects.id, project.id));
    if (project.appId)
      await this.db
        .insert(appSources)
        .values({ ...values, appId: project.appId })
        .onConflictDoUpdate({
          target: appSources.appId,
          set: { ...values, appId: project.appId, updatedAt: new Date() },
        });
  }
  releases(appId: string) {
    return this.db
      .select()
      .from(appReleases)
      .where(or(eq(appReleases.projectId, appId), eq(appReleases.appId, appId)))
      .orderBy(desc(appReleases.createdAt));
  }
  async release(appId: string, id: string) {
    return (
      await this.db
        .select()
        .from(appReleases)
        .where(
          and(
            or(eq(appReleases.projectId, appId), eq(appReleases.appId, appId)),
            eq(appReleases.id, id),
          ),
        )
        .limit(1)
    )[0];
  }
  async byVersion(appId: string, version: string) {
    return (
      await this.db
        .select()
        .from(appReleases)
        .where(
          and(
            or(eq(appReleases.projectId, appId), eq(appReleases.appId, appId)),
            eq(appReleases.version, version),
          ),
        )
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
