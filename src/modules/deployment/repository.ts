import { and, count, desc, eq, gte, inArray, ne } from 'drizzle-orm';

import { deploymentTokens, deployments } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class DeploymentRepository {
  constructor(private readonly db: DbExecutor) {}

  async createDeployment(input: {
    userId: string;
    appId: string;
    label: string;
    environment: string;
    serverHost?: string | null;
    primaryDomain?: string | null;
    adminDomain?: string | null;
    wsDomain?: string | null;
    installPath?: string | null;
    meta?: Record<string, unknown>;
  }) {
    const [deployment] = await this.db
      .insert(deployments)
      .values({
        userId: input.userId,
        appId: input.appId,
        label: input.label,
        environment: input.environment,
        serverHost: input.serverHost ?? null,
        primaryDomain: input.primaryDomain ?? null,
        adminDomain: input.adminDomain ?? null,
        wsDomain: input.wsDomain ?? null,
        installPath: input.installPath ?? '/opt/fd-headless-wp-system',
        status: 'active',
        meta: input.meta ?? {},
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    return deployment;
  }

  async listDeploymentsByUserId(userId: string) {
    return this.db.select().from(deployments).where(eq(deployments.userId, userId)).orderBy(desc(deployments.createdAt));
  }

  async listDeploymentsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.db.select().from(deployments).where(inArray(deployments.id, ids));
  }

  async findDeploymentById(id: string) {
    const [deployment] = await this.db.select().from(deployments).where(eq(deployments.id, id)).limit(1);
    return deployment ?? null;
  }

  async countActiveDeploymentsByUserAndApp(input: {
    userId: string;
    appId: string;
    excludeDeploymentId?: string;
  }) {
    const filters = [
      eq(deployments.userId, input.userId),
      eq(deployments.appId, input.appId),
      eq(deployments.status, 'active')
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
        updatedAt: new Date()
      })
      .returning();

    return token;
  }

  async listTokensByDeploymentIds(deploymentIds: string[]) {
    if (deploymentIds.length === 0) return [];
    return this.db.select().from(deploymentTokens).where(inArray(deploymentTokens.deploymentId, deploymentIds)).orderBy(desc(deploymentTokens.createdAt));
  }

  async expireActiveTokensByDeploymentId(deploymentId: string) {
    return this.db
      .update(deploymentTokens)
      .set({
        status: 'expired',
        updatedAt: new Date()
      })
      .where(and(eq(deploymentTokens.deploymentId, deploymentId), eq(deploymentTokens.status, 'active')))
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
          gte(deploymentTokens.expiresAt, now)
        )
      )
      .orderBy(desc(deploymentTokens.createdAt));
  }

  async markTokenUsed(tokenId: string) {
    const [token] = await this.db
      .update(deploymentTokens)
      .set({
        status: 'inactive',
        usedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(deploymentTokens.id, tokenId))
      .returning();

    return token ?? null;
  }

  async updateDeployment(deploymentId: string, input: {
    label?: string;
    environment?: string;
    serverHost?: string | null;
    primaryDomain?: string | null;
    adminDomain?: string | null;
    wsDomain?: string | null;
    installPath?: string | null;
    status?: 'active' | 'inactive' | 'cancelled' | 'expired';
    meta?: Record<string, unknown>;
    lastTokenIssuedAt?: Date | null;
    lastDeployedAt?: Date | null;
    updatedAt?: Date;
  }) {
    const changes: Record<string, unknown> = {
      updatedAt: input.updatedAt ?? new Date()
    };

    if (typeof input.label !== 'undefined') changes.label = input.label;
    if (typeof input.environment !== 'undefined') changes.environment = input.environment;
    if (typeof input.serverHost !== 'undefined') changes.serverHost = input.serverHost;
    if (typeof input.primaryDomain !== 'undefined') changes.primaryDomain = input.primaryDomain;
    if (typeof input.adminDomain !== 'undefined') changes.adminDomain = input.adminDomain;
    if (typeof input.wsDomain !== 'undefined') changes.wsDomain = input.wsDomain;
    if (typeof input.installPath !== 'undefined') changes.installPath = input.installPath;
    if (typeof input.status !== 'undefined') changes.status = input.status;
    if (typeof input.meta !== 'undefined') changes.meta = input.meta;
    if (typeof input.lastTokenIssuedAt !== 'undefined') changes.lastTokenIssuedAt = input.lastTokenIssuedAt;
    if (typeof input.lastDeployedAt !== 'undefined') changes.lastDeployedAt = input.lastDeployedAt;

    const [deployment] = await this.db
      .update(deployments)
      .set(changes)
      .where(eq(deployments.id, deploymentId))
      .returning();

    return deployment ?? null;
  }
}
