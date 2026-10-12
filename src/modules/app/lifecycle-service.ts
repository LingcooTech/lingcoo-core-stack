import type { z } from 'zod';
import {
  applicationImportSchema,
  applicationConnectionInputSchema,
  applicationConnectionSchema,
  applicationPreviewSchema,
  applicationReleaseInputSchema,
  applicationReleaseSchema,
  applicationLifecycleSchema,
  composePlanInputSchema,
} from '@lingcoo/contracts';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { encryptJson, decryptJson, getEncryptionKeys } from '../../lib/settings-crypto';
import { acquireTransactionLock } from '../../db/locks';
import { httpError } from '../../lib/errors';
import { AppRepository } from './repository';
import { AppLifecycleRepository } from './lifecycle-repository';
import { GitHubApplicationReader } from './github';
import {
  parseApplicationDocument,
  validateApplicationDefinition,
  definitionDigest,
} from './definition';
import type { AppService } from './service';
import type { AppDependencies } from './dependencies';
import { AppPublishingService } from './publishing-service';
import { AppImagesService } from './images-service';
import { compileComposePlan } from './compose-plan';

export class AppLifecycleService {
  async plan(code: string, releaseId: string, input: z.input<typeof composePlanInputSchema>) {
    const app = await this.app(code),
      row = await this.repository().release(app.id, releaseId);
    if (!row) throw httpError(404, 'Release not found');
    return {
      plan: compileComposePlan(this.releaseView(row), composePlanInputSchema.parse(input)),
      executionEnabled: false as const,
    };
  }
  images() {
    return new AppImagesService(this.db, this.env);
  }
  publishing() {
    return new AppPublishingService(
      this.db,
      this.env,
      this.dependencies,
      (db) =>
        new AppLifecycleService(db, this.env, this.dependencies, this.createApps, this.fetcher),
      this.fetcher,
    );
  }
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
    private readonly dependencies: AppDependencies,
    private readonly createApps: (db: DbExecutor) => Pick<AppService, 'upsertApp'>,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  private repository(db = this.db) {
    return new AppLifecycleRepository(db);
  }
  private keys() {
    return getEncryptionKeys(this.env);
  }
  private async event(
    db: DbExecutor,
    actor: string,
    name: string,
    properties: Record<string, unknown>,
    appId?: string,
  ) {
    await this.dependencies
      .createEventService(db)
      .capture({ userId: actor, appId, eventName: name, properties });
  }
  private connectionView(row: Awaited<ReturnType<AppLifecycleRepository['createConnection']>>) {
    return applicationConnectionSchema.parse({
      ...row,
      configured: true,
      createdAt: row.createdAt.toISOString(),
    });
  }
  async connections() {
    return {
      items: (await this.repository().listConnections()).map((v) => this.connectionView(v)),
    };
  }
  async connect(input: z.input<typeof applicationConnectionInputSchema>, actor: string) {
    const values = applicationConnectionInputSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const row = await this.repository(tx).createConnection({
        name: values.name,
        kind: values.kind,
        host: values.kind !== 'github' ? values.host.toLowerCase() : null,
        credentials: encryptJson(
          values.kind === 'github'
            ? { token: values.token }
            : values.kind === 'registry'
              ? { username: values.username, password: values.password }
              : {
                  region: values.region,
                  edition: values.edition,
                  instanceId: values.instanceId,
                  accessKeyId: values.accessKeyId,
                  accessKeySecret: values.accessKeySecret,
                },
          this.keys(),
        ),
      });
      await this.event(tx, actor, 'app.connection_created', {
        connectionId: row.id,
        kind: row.kind,
      });
      return this.connectionView(row);
    });
  }
  async disconnect(id: string, actor: string) {
    await this.db.transaction(async (tx) => {
      const refs = await this.repository(tx).connectionReferences(id);
      if (refs.length)
        throw httpError(
          409,
          'Connection is used by projects: ' + refs.map((p) => p.code).join(', '),
        );
      await this.repository(tx).deleteConnection(id);
      await this.event(tx, actor, 'app.connection_deleted', { connectionId: id });
    });
    return { ok: true as const };
  }
  async preview(input: z.input<typeof applicationImportSchema>) {
    const values = applicationImportSchema.parse(input);
    if (values.source) {
      let token = '';
      if (values.source.connectionId) {
        const connection = await this.repository().connection(values.source.connectionId);
        if (!connection || connection.kind !== 'github')
          throw httpError(422, 'GitHub connection not found');
        token = decryptJson<{ token: string }>(connection.credentials, this.keys()).token;
      }
      return new GitHubApplicationReader(token, this.fetcher).preview(values.source);
    }
    const definition = validateApplicationDefinition(parseApplicationDocument(values.document!));
    return {
      definition,
      definitionDigest: definitionDigest(definition),
      source: null,
      warnings: ['上传定义未绑定源码提交；可用于草稿导入，版本登记必须提供源码提交。'],
    };
  }
  async projects() {
    return {
      items: (await this.repository().projects()).map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        appId: p.appId,
        definitionReady: !!p.definition,
        repository: (p.source as { repository?: string } | null)?.repository ?? null,
        updatedAt: p.updatedAt.toISOString(),
      })),
    };
  }
  async createProject(input: z.input<typeof applicationPreviewSchema>, actor: string) {
    const preview = applicationPreviewSchema.parse(input),
      definition = validateApplicationDefinition(preview.definition);
    if (definitionDigest(definition) !== preview.definitionDigest)
      throw httpError(422, 'Preview content changed; validate again');
    return this.db.transaction(async (tx) => {
      await acquireTransactionLock(tx, 'app:publication:' + definition.app.code);
      const repo = this.repository(tx);
      if (
        (await repo.project(definition.app.code)) ||
        (await new AppRepository(tx).findAppByCode(definition.app.code))
      )
        throw httpError(409, 'Project code already exists');
      await repo.createProject({
        code: definition.app.code,
        name: definition.app.name,
        source: preview.source,
        definition,
        definitionDigest: preview.definitionDigest,
      });
      await this.event(tx, actor, 'development.project_created', {
        projectCode: definition.app.code,
      });
      return { projectCode: definition.app.code };
    });
  }
  async importProjectProduct(code: string, actor: string) {
    return this.db.transaction(async (tx) => {
      await acquireTransactionLock(tx, 'app:publication:' + code);
      const project = await this.app(code, tx);
      if (project.appId)
        throw httpError(
          409,
          'Project already has a product; existing product information is preserved',
        );
      if (await new AppRepository(tx).findAppByCode(code))
        throw httpError(409, 'Application code already exists');
      const definition = validateApplicationDefinition(project.definition);
      const { code: appCode, acquisition, license, ...info } = definition.app;
      const app = await this.createApps(tx).upsertApp(
        appCode,
        {
          ...info,
          status: 'inactive',
          features: definition.features.map((f) => ({ ...f, status: 'active' })),
          meta: {
            deliveryMode: definition.delivery.kind === 'none' ? 'none' : 'one_click',
            acquisition,
            license,
            deliveryProtocol: 'compose_v2',
          },
        },
        actor,
      );
      await this.repository(tx).linkProduct(project.id, app.id);
      await this.repository(tx).saveSource({
        appId: project.id,
        source: project.source,
        definition,
        definitionDigest: definitionDigest(definition),
      });
      await this.event(tx, actor, 'development.product_created', { projectCode: code }, app.id);
      return { appCode };
    });
  }
  // Compatibility for older clients; new UI creates a development project before a product.
  async import(input: z.input<typeof applicationPreviewSchema>, actor: string) {
    return this.db.transaction(async (tx) => {
      const lifecycle = new AppLifecycleService(
        tx,
        this.env,
        this.dependencies,
        this.createApps,
        this.fetcher,
      );
      const { projectCode } = await lifecycle.createProject(input, actor);
      return lifecycle.importProjectProduct(projectCode, actor);
    });
  }
  private async app(code: string, db = this.db) {
    const app = await new AppLifecycleRepository(db).owner(code);
    if (!app) throw httpError(404, 'App not found');
    return app;
  }
  private releaseView(row: Awaited<ReturnType<AppLifecycleRepository['createRelease']>>) {
    return applicationReleaseSchema.parse({
      ...row,
      createdAt: row.createdAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
    });
  }
  async overview(code: string) {
    const app = await this.app(code),
      source = await this.repository().source(app.id);
    return applicationLifecycleSchema.parse({
      source: source?.source ?? null,
      definition: source?.definition ?? null,
      releases: (await this.repository().releases(app.id)).map((v) => this.releaseView(v)),
    });
  }
  async registerRelease(
    code: string,
    input: z.input<typeof applicationReleaseInputSchema>,
    actor: string,
  ) {
    const value = applicationReleaseInputSchema.parse(input),
      definition = validateApplicationDefinition(value.definition);
    if (definition.app.code !== code) throw httpError(422, 'Release application identity mismatch');
    if (Object.keys(value.images).length !== definition.images.length)
      throw httpError(422, 'Release must include exactly the declared images');
    for (const image of definition.images)
      if (
        typeof value.images[image.key] !== 'string' ||
        !value.images[image.key]!.startsWith(image.repository + '@sha256:')
      )
        throw httpError(422, `Image ${image.key} does not match its registered repository`);
    const digest = definitionDigest(definition);
    return this.db.transaction(async (tx) => {
      await acquireTransactionLock(tx, 'app:publication:' + code);
      const app = await this.app(code, tx),
        repo = this.repository(tx),
        existing = await repo.byVersion(app.id, value.version);
      if (existing) {
        if (
          existing.commit !== value.commit ||
          existing.definitionDigest !== digest ||
          definitionDigest(existing.images) !== definitionDigest(value.images) ||
          existing.notes !== value.notes ||
          existing.buildUrl !== (value.buildUrl ?? null)
        )
          throw httpError(409, 'Version already exists with different content');
        return this.releaseView(existing);
      }
      const row = await repo.createRelease({
        appId: app.appId,
        projectId: app.id,
        version: value.version,
        commit: value.commit,
        definition,
        definitionDigest: digest,
        images: value.images,
        notes: value.notes,
        buildUrl: value.buildUrl ?? null,
      });
      await this.event(
        tx,
        actor,
        'app.release_registered',
        { version: value.version, commit: value.commit, definitionDigest: digest },
        app.appId ?? undefined,
      );
      return this.releaseView(row);
    });
  }
  async transition(code: string, id: string, status: 'published' | 'withdrawn', actor: string) {
    return this.db.transaction(async (tx) => {
      await acquireTransactionLock(tx, 'app:publication:' + code);
      const app = await this.app(code, tx),
        repo = this.repository(tx),
        row = await repo.release(app.id, id);
      if (!row) throw httpError(404, 'Release not found');
      if (row.status === status) return this.releaseView(row);
      if (status === 'published' && row.status !== 'draft')
        throw httpError(409, 'Only draft releases can be published');
      // Container release publication requires the generic executor verification gate.
      if (
        status === 'published' &&
        validateApplicationDefinition(row.definition).delivery.kind === 'compose'
      )
        throw httpError(422, 'Compose release requires runtime validation before publication');
      const next = await repo.setReleaseStatus(id, status);
      await this.event(
        tx,
        actor,
        'app.release_' + status,
        { releaseId: id, version: row.version },
        app.appId ?? undefined,
      );
      return this.releaseView(next);
    });
  }
}
