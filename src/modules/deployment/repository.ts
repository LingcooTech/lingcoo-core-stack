import { and, count, desc, eq, gte, inArray, ne } from 'drizzle-orm';

import { deploymentTokens, deployments } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class DeploymentRepository {
  constructor(private readonly db: DbExecutor) {}

  async lockById(id: string): Promise<void> {
    await this.db
      .select({ id: deployments.id })
      .from(deployments)
      .where(eq(deployments.id, id))
      .for('update');
  }

  async createDeployment(input: {
    userId: string;
    appId: string;
    entitlementId: string;
    label: string;
    environment: string;
    deploymentMode?: 'self_hosted' | 'managed';
    hostedPrefix?: string | null;
    hostedDomain?: string | null;
    hostingState?: string | null;
    hostingResources?: { cpuMillis: number; memoryMb: number; diskMb: number } | null;
    serverHost?: string | null;
    installPath: string;
    meta?: Record<string, unknown>;
  }) {
    const [deployment] = await this.db
      .insert(deployments)
      .values({
        userId: input.userId,
        appId: input.appId,
        entitlementId: input.entitlementId,
        label: input.label,
        environment: input.environment,
        deploymentMode: input.deploymentMode ?? 'self_hosted',
        hostedPrefix: input.hostedPrefix,
        hostedDomain: input.hostedDomain,
        hostingState: input.hostingState,
        hostingResources: input.hostingResources,
        serverHost: input.serverHost ?? null,
        installPath: input.installPath,
        status: 'active',
        meta: input.meta ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!deployment) throw new Error('Missing required write result: deployment deployment');

    return deployment;
  }

  async listDeploymentsByUserId(userId: string) {
    return this.db
      .select()
      .from(deployments)
      .where(eq(deployments.userId, userId))
      .orderBy(desc(deployments.createdAt));
  }

  async listDeploymentsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.db.select().from(deployments).where(inArray(deployments.id, ids));
  }

  async findDeploymentById(id: string) {
    const [deployment] = await this.db
      .select()
      .from(deployments)
      .where(eq(deployments.id, id))
      .limit(1);
    return deployment ?? null;
  }

  async countActiveDeploymentsByEntitlementId(input: {
    entitlementId: string;
    excludeDeploymentId?: string;
  }) {
    const filters = [
      eq(deployments.entitlementId, input.entitlementId),
      eq(deployments.status, 'active'),
    ];

    if (input.excludeDeploymentId) {
      filters.push(ne(deployments.id, input.excludeDeploymentId));
    }

    const [result] = await this.db
      .select({ count: count() })
      .from(deployments)
      .where(and(...filters));

    return Number(result?.count ?? 0);
  }

  async createDeploymentToken(input: {
    deploymentId: string;
    issuedByUserId?: string | null;
    tokenHash: string;
    tokenHint: string;
    expiresAt?: Date | null;
    meta?: Record<string, unknown>;
  }) {
    const [token] = await this.db
      .insert(deploymentTokens)
      .values({
        deploymentId: input.deploymentId,
        issuedByUserId: input.issuedByUserId ?? null,
        tokenHash: input.tokenHash,
        tokenHint: input.tokenHint,
        status: 'active',
        expiresAt: input.expiresAt ?? null,
        meta: input.meta ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (!token) throw new Error('Missing required write result: deployment token');

    return token;
  }

  async listTokensByDeploymentIds(deploymentIds: string[]) {
    if (deploymentIds.length === 0) return [];
    return this.db
      .select()
      .from(deploymentTokens)
      .where(inArray(deploymentTokens.deploymentId, deploymentIds))
      .orderBy(desc(deploymentTokens.createdAt));
  }

  async expireActiveTokensByDeploymentId(deploymentId: string) {
    return this.db
      .update(deploymentTokens)
      .set({
        status: 'expired',
        updatedAt: new Date(),
      })
      .where(
        and(eq(deploymentTokens.deploymentId, deploymentId), eq(deploymentTokens.status, 'active')),
      )
      .returning();
  }

  async listActiveTokensByHint(tokenHint: string, now = new Date()) {
    return this.db
      .select()
      .from(deploymentTokens)
      .where(
        and(
          eq(deploymentTokens.tokenHint, tokenHint),
          eq(deploymentTokens.status, 'active'),
          gte(deploymentTokens.expiresAt, now),
        ),
      )
      .orderBy(desc(deploymentTokens.createdAt));
  }

  async markTokenUsed(tokenId: string) {
    const [token] = await this.db
      .update(deploymentTokens)
      .set({
        status: 'inactive',
        usedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(deploymentTokens.id, tokenId),
          eq(deploymentTokens.status, 'active'),
          gte(deploymentTokens.expiresAt, new Date()),
        ),
      )
      .returning();

    return token ?? null;
  }

  async updateDeployment(
    deploymentId: string,
    input: {
      label?: string;
      environment?: string;
      serverHost?: string | null;
      installPath?: string | null;
      hostingNodeId?: string | null;
      hostingState?: string;
      status?: 'active' | 'inactive' | 'cancelled' | 'expired';
      meta?: Record<string, unknown>;
      lastTokenIssuedAt?: Date | null;
      lastDeployedAt?: Date | null;
      updatedAt?: Date;
    },
  ) {
    const changes: Record<string, unknown> = {
      updatedAt: input.updatedAt ?? new Date(),
    };

    if (typeof input.hostingState !== 'undefined') changes.hostingState = input.hostingState;
    if (typeof input.hostingNodeId !== 'undefined') changes.hostingNodeId = input.hostingNodeId;
    if (typeof input.label !== 'undefined') changes.label = input.label;
    if (typeof input.environment !== 'undefined') changes.environment = input.environment;
    if (typeof input.serverHost !== 'undefined') changes.serverHost = input.serverHost;
    if (typeof input.installPath !== 'undefined') changes.installPath = input.installPath;
    if (typeof input.status !== 'undefined') changes.status = input.status;
    if (typeof input.meta !== 'undefined') changes.meta = input.meta;
    if (typeof input.lastTokenIssuedAt !== 'undefined')
      changes.lastTokenIssuedAt = input.lastTokenIssuedAt;
    if (typeof input.lastDeployedAt !== 'undefined') changes.lastDeployedAt = input.lastDeployedAt;

    const [deployment] = await this.db
      .update(deployments)
      .set(changes)
      .where(eq(deployments.id, deploymentId))
      .returning();

    return deployment ?? null;
  }
}
