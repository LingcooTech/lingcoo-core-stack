import { createHash, randomBytes } from 'node:crypto';
import type { z } from 'zod';
import {
  applicationPreviewSchema,
  type applicationReleaseInputSchema,
  publishingTokenSchema,
  buildRequestInputSchema,
  buildRequestSchema,
  workflowRunViewSchema,
} from '@lingcoo/contracts';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { decryptJson, getEncryptionKeys } from '../../lib/settings-crypto';
import { acquireTransactionLock } from '../../db/locks';
import { httpError } from '../../lib/errors';
import { AppLifecycleRepository } from './lifecycle-repository';
import { validateApplicationDefinition, definitionDigest } from './definition';
import { GitHubActionsClient } from './github-actions';
import type { AppDependencies } from './dependencies';
import type { AppLifecycleService } from './lifecycle-service';

export class AppPublishingService {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
    private readonly dependencies: AppDependencies,
    private readonly lifecycle: (db: DbExecutor) => Pick<AppLifecycleService, 'registerRelease'>,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  private repo(db = this.db) {
    return new AppLifecycleRepository(db);
  }
  private async app(code: string, db = this.db) {
    const app = await this.repo(db).owner(code);
    if (!app) throw httpError(404, 'App not found');
    return app;
  }
  private async event(
    db: DbExecutor,
    actor: string,
    appId: string | null,
    name: string,
    properties: Record<string, unknown>,
  ) {
    await this.dependencies
      .createEventService(db)
      .capture({ userId: actor, appId: appId ?? undefined, eventName: name, properties });
  }
  async applySource(code: string, input: z.input<typeof applicationPreviewSchema>, actor: string) {
    const preview = applicationPreviewSchema.parse(input),
      definition = validateApplicationDefinition(preview.definition);
    if (definition.app.code !== code || definitionDigest(definition) !== preview.definitionDigest)
      throw httpError(422, 'Source identity or digest mismatch');
    await this.db.transaction(async (tx) => {
      await acquireTransactionLock(tx, 'app:publication:' + code);
      const app = await this.app(code, tx);
      await this.repo(tx).saveSource({
        appId: app.id,
        source: preview.source,
        definition,
        definitionDigest: preview.definitionDigest,
      });
      await this.event(tx, actor, app.appId, 'app.source_updated', {
        commit: preview.source?.commit ?? null,
        definitionDigest: preview.definitionDigest,
      });
    });
    return preview;
  }
  private tokenView(row: Awaited<ReturnType<AppLifecycleRepository['createPublishingToken']>>) {
    return publishingTokenSchema.parse({
      ...row,
      configured: true,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    });
  }
  async tokens(code: string) {
    const app = await this.app(code);
    return { items: (await this.repo().tokens(app.id)).map((v) => this.tokenView(v)) };
  }
  async issueToken(code: string, name: string, actor: string) {
    const app = await this.app(code),
      token = 'stk_publish_' + randomBytes(32).toString('base64url');
    return this.db.transaction(async (tx) => {
      const record = await this.repo(tx).createPublishingToken({
        appId: app.appId,
        projectId: app.id,
        actorUserId: actor,
        name,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(this.dependencies.now().getTime() + 90 * 86400000),
      });
      await this.event(tx, actor, app.appId, 'app.publishing_token_issued', { tokenId: record.id });
      return { token, record: this.tokenView(record) };
    });
  }
  async revokeToken(code: string, id: string, actor: string) {
    const app = await this.app(code);
    await this.db.transaction(async (tx) => {
      await acquireTransactionLock(tx, 'app:publication:' + code);
      await this.repo(tx).revokeToken(app.id, id);
      await this.event(tx, actor, app.appId, 'app.publishing_token_revoked', { tokenId: id });
    });
    return { ok: true as const };
  }
  async submit(code: string, token: string, input: z.input<typeof applicationReleaseInputSchema>) {
    if (!/^stk_publish_[A-Za-z0-9_-]{43}$/.test(token))
      throw httpError(401, 'Invalid publishing credential');
    const record = await this.repo().token(createHash('sha256').update(token).digest('hex'));
    const app = await this.app(code);
    if (
      !record ||
      (record.projectId ?? record.appId) !== app.id ||
      record.revoked ||
      record.expiresAt <= this.dependencies.now()
    )
      throw httpError(401, 'Invalid publishing credential');
    // Recheck under the same application lock as revocation and registration.
    return this.db.transaction(async (tx) => {
      await acquireTransactionLock(tx, 'app:publication:' + code);
      const current = await this.repo(tx).token(record.tokenHash);
      if (!current || current.revoked || current.expiresAt <= this.dependencies.now())
        throw httpError(401, 'Invalid publishing credential');
      return this.lifecycle(tx).registerRelease(code, input, record.actorUserId);
    });
  }
  private buildView(row: Awaited<ReturnType<AppLifecycleRepository['createBuild']>>) {
    return buildRequestSchema.parse({ ...row, createdAt: row.createdAt.toISOString() });
  }
  private async actions(code: string) {
    const app = await this.app(code),
      row = await this.repo().source(app.id);
    if (!row) throw httpError(422, 'Application source is not configured');
    const source = applicationPreviewSchema.shape.source.parse(row.source),
      definition = validateApplicationDefinition(row.definition);
    if (!source || !definition.build)
      throw httpError(422, 'Repository source and build workflow are required');
    let token = '';
    if (source.connectionId) {
      const connection = await this.repo().connection(source.connectionId);
      if (!connection || connection.kind !== 'github')
        throw httpError(422, 'GitHub connection not found');
      token = decryptJson<{ token: string }>(
        connection.credentials,
        getEncryptionKeys(this.env),
      ).token;
    }
    return {
      app,
      source,
      workflow: definition.build.workflow,
      client: new GitHubActionsClient(token, this.fetcher),
    };
  }
  async builds(code: string) {
    const app = await this.app(code),
      row = await this.repo().source(app.id);
    const requests = (await this.repo().builds(app.id)).map((v) => this.buildView(v));
    if (!row || !row.source || !validateApplicationDefinition(row.definition).build)
      return { requests, runs: [], connected: false };
    const actions = await this.actions(code),
      runs = await actions.client.runs(actions.source.repository, actions.workflow);
    return {
      requests,
      connected: true,
      runs: runs.map((v) =>
        workflowRunViewSchema.parse({
          id: v.id,
          commit: v.head_sha,
          status: v.status,
          conclusion: v.conclusion,
          url: v.html_url,
          title: v.display_title,
          createdAt: v.created_at,
        }),
      ),
    };
  }
  async dispatch(code: string, input: z.input<typeof buildRequestInputSchema>, actor: string) {
    const value = buildRequestInputSchema.parse(input),
      actions = await this.actions(code);
    const result = await this.db.transaction(async (tx) => {
      await acquireTransactionLock(tx, 'app:build:' + value.requestId);
      const existing = await this.repo(tx).build(value.requestId);
      if (existing) {
        if (
          (existing.projectId ?? existing.appId) !== actions.app.id ||
          existing.version !== value.version ||
          existing.commit !== actions.source.commit
        )
          throw httpError(409, 'Build request already exists with different content');
        return { row: existing, existing: true };
      }
      const row = await this.repo(tx).createBuild({
        id: value.requestId,
        appId: actions.app.appId,
        projectId: actions.app.id,
        version: value.version,
        commit: actions.source.commit,
      });
      await this.event(tx, actor, actions.app.appId, 'app.build_requested', {
        requestId: row.id,
        commit: row.commit,
        version: row.version,
      });
      return { row, existing: false };
    });
    if (result.existing) return this.buildView(result.row);
    try {
      await actions.client.dispatch(
        actions.source.repository,
        actions.workflow,
        actions.source.ref,
        {
          stack_build_id: result.row.id,
          stack_commit: result.row.commit,
          stack_version: result.row.version,
        },
      );
    } catch (e) {
      await this.repo().setBuildStatus(
        result.row.id,
        (e as { statusCode?: number }).statusCode === 502 ? 'unknown' : 'failed',
      );
      throw e;
    }
    return this.buildView(await this.repo().setBuildStatus(result.row.id, 'dispatched'));
  }
}
