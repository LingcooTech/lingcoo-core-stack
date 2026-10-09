import { and, eq, gt, inArray, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  hostingNodeReportSchema,
  type handoverCommandSchema,
  reclamationEvidenceSchema,
} from '@lingcoo/contracts';
import {
  deployments,
  hostingExits,
  hostingExitEvents,
  hostingOperations,
  hostingNodes,
  hostingHandovers,
  hostingHandoverGrants,
  hostingReclamations,
} from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { encryptJson, decryptJson, getEncryptionKeys } from '../../lib/settings-crypto';
import { httpError } from '../../lib/errors';
import { HostingRepository, HOSTING_REPORT_MAX_AGE_MS } from './hosting';
import { HandoverStorage, HANDOVER_MAX_BYTES } from './handover-storage';
import { assertNoOpenDeploymentTickets } from '../ticket/public';
export class HostingHandoverService {
  readonly storage: HandoverStorage;
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
    private readonly now = () => new Date(),
  ) {
    this.storage = new HandoverStorage(env.HOSTING_HANDOVER_DIR);
  }
  private async deployment(id: string, owner?: string) {
    const [d] = await this.db
      .select()
      .from(deployments)
      .where(and(eq(deployments.id, id), owner ? eq(deployments.userId, owner) : undefined));
    if (!d || d.deploymentMode !== 'managed') throw httpError(404, '未找到托管实例');
    return d;
  }
  private async event(id: string, kind: string, actor?: string) {
    await this.db
      .insert(hostingExitEvents)
      .values({ deploymentId: id, kind, actorUserId: actor, createdAt: this.now() });
  }
  async read(id: string, owner?: string) {
    await this.deployment(id, owner);
    const rows = await this.db
      .select()
      .from(hostingHandovers)
      .where(eq(hostingHandovers.deploymentId, id))
      .orderBy(desc(hostingHandovers.createdAt))
      .limit(20);
    const [reclamation] = await this.db
      .select()
      .from(hostingReclamations)
      .where(eq(hostingReclamations.deploymentId, id));
    return {
      items: rows.map((r) => ({
        id: r.id,
        state: r.state,
        sha256: r.sha256,
        size: r.size,
        received: r.received,
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      reclamation: reclamation
        ? { state: reclamation.state, completedAt: reclamation.completedAt?.toISOString() ?? null }
        : null,
    };
  }
  async command(
    id: string,
    actor: string,
    input: z.infer<typeof handoverCommandSchema>,
    admin = false,
  ) {
    return this.db.transaction(async (tx) => {
      await new HostingRepository(tx).lockPool();
      const svc = new HostingHandoverService(tx, this.env, this.now),
        d = await svc.deployment(id, admin ? undefined : actor),
        now = this.now();
      const [exit] = await tx.select().from(hostingExits).where(eq(hostingExits.deploymentId, id));
      if (
        !exit ||
        !['retained', 'completed'].includes(exit.state) ||
        !exit.evidence ||
        !d.hostingNodeId
      )
        throw httpError(409, '请先完成停服及异机备份');
      const [reclamation] = await tx
        .select()
        .from(hostingReclamations)
        .where(eq(hostingReclamations.deploymentId, id));
      if (input.kind === 'prepare' || input.kind === 'reclaim') {
        if (!admin) throw httpError(403, '仅运维人员可执行');
        const command = input as Extract<typeof input, { kind: 'prepare' | 'reclaim' }>;
        const kind = command.kind === 'prepare' ? 'export' : 'reclaim';
        const [prior] = await tx
          .select()
          .from(hostingOperations)
          .where(eq(hostingOperations.requestKey, command.requestKey));
        if (prior) {
          if (prior.deploymentId !== id || prior.kind !== kind || prior.requestedBy !== actor)
            throw httpError(409, '请求标识已被使用');
          return { ok: true as const };
        }
        if (reclamation || exit.version !== command.expectedVersion || d.status !== 'active')
          throw httpError(409, '实例状态已变化，请刷新');
        const [active] = await tx
          .select()
          .from(hostingOperations)
          .where(
            and(
              eq(hostingOperations.deploymentId, id),
              inArray(hostingOperations.state, ['pending', 'running']),
            ),
          );
        if (active) throw httpError(409, '已有运维任务，请等待完成');
        const [node] = await tx
          .select()
          .from(hostingNodes)
          .where(eq(hostingNodes.id, d.hostingNodeId));
        const report = hostingNodeReportSchema.safeParse(node?.report);
        const age = node?.lastReportedAt ? now.getTime() - node.lastReportedAt.getTime() : Infinity;
        if (
          !report.success ||
          !report.data.supportedOperations?.includes(kind) ||
          !report.data.canDeploy ||
          !report.data.dockerReady ||
          age < 0 ||
          age > HOSTING_REPORT_MAX_AGE_MS
        )
          throw httpError(409, '节点尚不支持此操作或已离线');
        if (command.kind === 'reclaim') {
          if (
            command.confirmDeploymentId !== id ||
            exit.state !== 'completed' ||
            !exit.retainUntil ||
            exit.retainUntil > now
          )
            throw httpError(409, '须确认实例且客户已交接、保留期届满');
          await assertNoOpenDeploymentTickets(tx, id);
          const [live] = await tx
            .select()
            .from(hostingHandovers)
            .where(
              and(
                eq(hostingHandovers.deploymentId, id),
                inArray(hostingHandovers.state, ['preparing', 'ready']),
                gt(hostingHandovers.expiresAt, now),
              ),
            );
          if (live) throw httpError(409, '请等待交付包过期或撤销后再回收');
        } else {
          const [live] = await tx
            .select()
            .from(hostingHandovers)
            .where(
              and(
                eq(hostingHandovers.deploymentId, id),
                inArray(hostingHandovers.state, ['preparing', 'ready']),
                gt(hostingHandovers.expiresAt, now),
              ),
            );
          if (live) throw httpError(409, '已有有效交付包，请先撤销或等待过期');
          await svc.storage.capacity(HANDOVER_MAX_BYTES);
        }
        const [op] = await tx
          .insert(hostingOperations)
          .values({
            deploymentId: id,
            nodeId: d.hostingNodeId,
            kind,
            requestKey: command.requestKey,
            requestedBy: actor,
            createdAt: now,
          })
          .returning();
        if (command.kind === 'prepare')
          await tx.insert(hostingHandovers).values({
            deploymentId: id,
            operationId: op!.id,
            expiresAt: new Date(now.getTime() + 24 * 3600000),
            createdAt: now,
          });
        else
          await tx
            .insert(hostingReclamations)
            .values({ deploymentId: id, operationId: op!.id, createdAt: now });
        await svc.event(id, kind + '_requested', actor);
        return { ok: true as const };
      }
      const [row] = await tx
        .select()
        .from(hostingHandovers)
        .where(
          and(eq(hostingHandovers.id, input.handoverId), eq(hostingHandovers.deploymentId, id)),
        )
        .for('update');
      if (!row) throw httpError(404, '交付包不存在');
      if (input.kind === 'revoke') {
        if (!admin) throw httpError(403, '仅运维人员可撤销');
        if (row.state === 'preparing') throw httpError(409, '制作任务执行中，请等待任务完成或过期');
        await tx
          .update(hostingHandovers)
          .set({ state: 'revoked', encryptedIdentity: null })
          .where(eq(hostingHandovers.id, row.id));
        await svc.event(id, 'handover_revoked', actor);
        return { ok: true as const };
      }
      if (actor !== d.userId) throw httpError(403, '仅实例所属客户可获取交付数据');
      if (reclamation || row.state !== 'ready' || row.expiresAt <= now)
        throw httpError(409, '交付包已失效');
      if (input.kind === 'key') {
        const identity = decryptJson<{ identity: string }>(
          row.encryptedIdentity,
          getEncryptionKeys(this.env),
        ).identity;
        await tx
          .update(hostingHandovers)
          .set({ keyReceivedAt: now })
          .where(eq(hostingHandovers.id, row.id));
        await svc.event(id, 'handover_key_received', actor);
        return { ok: true as const, identity };
      }
      const expiresAt = new Date(Math.min(row.expiresAt.getTime(), now.getTime() + 10 * 60000));
      const [grant] = await tx
        .insert(hostingHandoverGrants)
        .values({ handoverId: row.id, userId: actor, expiresAt })
        .returning();
      await svc.event(id, 'handover_download_granted', actor);
      return {
        ok: true as const,
        expiresAt: expiresAt.toISOString(),
        downloadPath: `/v1/deployments/${id}/handover/${row.id}/download/${grant!.id}`,
      };
    });
  }
  async download(id: string, handoverId: string, grantId: string, actor: string) {
    return this.db.transaction(async (tx) => {
      await new HostingRepository(tx).lockPool();
      const svc = new HostingHandoverService(tx, this.env, this.now);
      await svc.deployment(id, actor);
      const [row] = await tx
        .select()
        .from(hostingHandovers)
        .where(and(eq(hostingHandovers.id, handoverId), eq(hostingHandovers.deploymentId, id)));
      const [grant] = await tx
        .select()
        .from(hostingHandoverGrants)
        .where(
          and(
            eq(hostingHandoverGrants.id, grantId),
            eq(hostingHandoverGrants.handoverId, handoverId),
            eq(hostingHandoverGrants.userId, actor),
          ),
        )
        .for('update');
      if (
        !row ||
        row.state !== 'ready' ||
        row.expiresAt <= this.now() ||
        !grant ||
        grant.consumedAt ||
        grant.expiresAt <= this.now()
      )
        throw httpError(410, '下载授权已失效，请重新领取');
      // Open before consuming the grant; never follow symlinks. Files are immutable once ready.
      const stream = await svc.storage.stream(row.id);
      try {
        await tx
          .update(hostingHandoverGrants)
          .set({ consumedAt: this.now() })
          .where(eq(hostingHandoverGrants.id, grant.id));
        await svc.event(id, 'handover_download_started', actor);
        return { stream, size: row.size!, sha256: row.sha256! };
      } catch (e) {
        stream.destroy();
        throw e;
      }
    });
  }
  async nodeOperation(nodeId: string, token: string, operationId: string) {
    await new HostingRepository(this.db).authenticate(nodeId, token);
    const [op] = await this.db
      .select()
      .from(hostingOperations)
      .where(and(eq(hostingOperations.id, operationId), eq(hostingOperations.nodeId, nodeId)));
    if (!op || !['export', 'reclaim'].includes(op.kind) || op.state !== 'running')
      throw httpError(409, '任务归属或状态不匹配');
    return op;
  }
  async nodeRead(nodeId: string, token: string, operationId: string) {
    const op = await this.nodeOperation(nodeId, token, operationId);
    const [exit] = await this.db
      .select()
      .from(hostingExits)
      .where(eq(hostingExits.deploymentId, op.deploymentId));
    const [row] = await this.db
      .select()
      .from(hostingHandovers)
      .where(eq(hostingHandovers.operationId, op.id));
    return {
      exitEvidence: exit!.evidence,
      retainUntil: exit!.retainUntil?.toISOString(),
      handover: row
        ? {
            id: row.id,
            state: row.state,
            received: row.received,
            size: row.size,
            sha256: row.sha256,
          }
        : null,
      maxBytes: HANDOVER_MAX_BYTES,
    };
  }
  async upload(nodeId: string, token: string, operationId: string, body: unknown) {
    const input = z
      .discriminatedUnion('kind', [
        z
          .object({
            kind: z.literal('begin'),
            size: z.number().int().positive().max(HANDOVER_MAX_BYTES),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            identity: z
              .string()
              .regex(/^AGE-SECRET-KEY-1[0-9A-Z]+\n?$/)
              .max(200),
          })
          .strict(),
        z
          .object({
            kind: z.literal('chunk'),
            offset: z.number().int().nonnegative(),
            data: z
              .string()
              .min(4)
              .max(1398104)
              .regex(/^[A-Za-z0-9+/]+={0,2}$/),
          })
          .strict(),
        z.object({ kind: z.literal('finish') }).strict(),
      ])
      .parse(body);
    return this.db.transaction(async (tx) => {
      await new HostingRepository(tx).lockPool();
      const svc = new HostingHandoverService(tx, this.env, this.now),
        op = await svc.nodeOperation(nodeId, token, operationId);
      const [row] = await tx
        .select()
        .from(hostingHandovers)
        .where(eq(hostingHandovers.operationId, op.id))
        .for('update');
      if (op.kind !== 'export' || !row || row.state === 'revoked' || row.expiresAt <= this.now())
        throw httpError(409, '交付任务已失效');
      if (row.state === 'ready') return { received: row.received, ready: true };
      if (input.kind === 'begin') {
        if (row.size !== null) {
          if (
            row.size !== input.size ||
            row.sha256 !== input.sha256 ||
            decryptJson<{ identity: string }>(row.encryptedIdentity, getEncryptionKeys(this.env))
              .identity !== input.identity
          )
            throw httpError(409, '交付内容不可替换');
          return { received: row.received, ready: false };
        }
        const [usage] = await tx
          .select({ bytes: sql<number>`coalesce(sum(${hostingHandovers.size}),0)` })
          .from(hostingHandovers)
          .where(
            and(
              inArray(hostingHandovers.state, ['preparing', 'ready']),
              gt(hostingHandovers.expiresAt, this.now()),
            ),
          );
        if (Number(usage!.bytes) + input.size > 4 * HANDOVER_MAX_BYTES)
          throw httpError(409, '临时交付存储额度已满');
        await svc.storage.capacity(input.size);
        await tx
          .update(hostingHandovers)
          .set({
            size: input.size,
            sha256: input.sha256,
            encryptedIdentity: encryptJson(
              { identity: input.identity },
              getEncryptionKeys(this.env),
            ),
          })
          .where(eq(hostingHandovers.id, row.id));
        return { received: 0, ready: false };
      }
      if (!row.size || !row.sha256) throw httpError(409, '须先登记交付包');
      if (input.kind === 'chunk') {
        const data = Buffer.from(input.data, 'base64');
        if (
          !data.length ||
          data.length > 1048576 ||
          data.toString('base64') !== input.data ||
          input.offset !== row.received ||
          row.received + data.length > row.size
        )
          throw httpError(409, '上传偏移或长度不匹配');
        await svc.storage.write(row.id, row.received, data);
        await tx
          .update(hostingHandovers)
          .set({ received: row.received + data.length })
          .where(eq(hostingHandovers.id, row.id));
        return { received: row.received + data.length, ready: false };
      }
      if (row.received !== row.size) throw httpError(409, '交付包上传未完成');
      await svc.storage.verify(row.id, row.size, row.sha256);
      await tx
        .update(hostingHandovers)
        .set({ state: 'ready', expiresAt: new Date(this.now().getTime() + 7 * 86400000) })
        .where(eq(hostingHandovers.id, row.id));
      const [exit] = await tx
        .select()
        .from(hostingExits)
        .where(eq(hostingExits.deploymentId, op.deploymentId));
      if (exit?.state === 'retained')
        await tx
          .update(hostingExits)
          .set({
            handoverReference: '加密交付包 ' + row.id,
            version: exit.version + 1,
            updatedAt: this.now(),
          })
          .where(eq(hostingExits.id, exit.id));
      await svc.event(op.deploymentId, 'handover_ready');
      return { received: row.received, ready: true };
    });
  }
  async cleanup() {
    return this.db.transaction(async (tx) => {
      await new HostingRepository(tx).lockPool();
      const rows = await tx
        .select()
        .from(hostingHandovers)
        .where(
          sql`(${hostingHandovers.state}='revoked' or ${hostingHandovers.expiresAt}<=${this.now()}) and (${hostingHandovers.state}<>'revoked' or ${hostingHandovers.encryptedIdentity} is not null or ${hostingHandovers.received}>0)`,
        )
        .limit(100);
      for (const row of rows) {
        await this.storage.remove(row.id);
        await tx
          .update(hostingHandovers)
          .set({ state: 'revoked', encryptedIdentity: null, received: 0 })
          .where(eq(hostingHandovers.id, row.id));
      }
      return rows.length;
    });
  }
}
export async function completeReclamation(
  db: DbExecutor,
  operationId: string,
  evidence: unknown,
  now: Date,
) {
  const proof = reclamationEvidenceSchema.parse(evidence);
  const [row] = await db
    .select()
    .from(hostingReclamations)
    .where(eq(hostingReclamations.operationId, operationId));
  if (
    !row ||
    row.state !== 'pending' ||
    proof.deploymentId !== row.deploymentId ||
    proof.operationId !== operationId ||
    Date.parse(proof.completedAt) > now.getTime() + 60000 ||
    Date.parse(proof.completedAt) < row.createdAt.getTime() - 60000
  )
    throw httpError(409, '回收证据不匹配');
  const [exit] = await db
    .select()
    .from(hostingExits)
    .where(eq(hostingExits.deploymentId, row.deploymentId));
  if (
    !exit ||
    exit.state !== 'completed' ||
    !exit.retainUntil ||
    exit.retainUntil > now ||
    (exit.evidence as { backupId: string }).backupId !== proof.backupId
  )
    throw httpError(409, '回收保护条件不满足');
  await db
    .update(hostingReclamations)
    .set({ state: 'completed', completedAt: now, evidence: proof })
    .where(eq(hostingReclamations.id, row.id));
  await db
    .update(deployments)
    .set({ status: 'inactive', updatedAt: now })
    .where(eq(deployments.id, row.deploymentId));
  await db
    .insert(hostingExitEvents)
    .values({ deploymentId: row.deploymentId, kind: 'reclaimed', createdAt: now });
}
