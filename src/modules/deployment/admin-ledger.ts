import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { adminDeploymentQuerySchema, AdminDeploymentsSchema } from '@lingcoo/contracts';
import type { FastifyPluginAsync } from 'fastify';
import type { DbExecutor } from '../../db/types';
import { apps, deployments, entitlements, hostingNodes, users } from '../../db/schema';
import { normalizeDeploymentMeta } from './record-utils';

export async function listAdminDeployments(db: DbExecutor, query: unknown) {
  const q = adminDeploymentQuerySchema.parse(query);
  const escaped = q.search.replace(/[\\%_]/g, '\\$&');
  const where = and(
    q.mode === 'all' ? undefined : eq(deployments.deploymentMode, q.mode),
    q.status === 'all' ? undefined : eq(deployments.status, q.status),
    q.search
      ? or(
          ilike(deployments.label, `%${escaped}%`),
          ilike(users.email, `%${escaped}%`),
          ilike(apps.code, `%${escaped}%`),
          ilike(apps.name, `%${escaped}%`),
          ilike(deployments.hostedDomain, `%${escaped}%`),
          ilike(deployments.serverHost, `%${escaped}%`),
          ilike(sql`${deployments.id}::text`, `%${escaped}%`),
        )
      : undefined,
  );
  // Explicit projections: raw meta, credentials and token records never leave this module.
  const rows = await db
    .select({
      id: deployments.id,
      label: deployments.label,
      userId: deployments.userId,
      customerEmail: users.email,
      appCode: apps.code,
      appName: apps.name,
      mode: deployments.deploymentMode,
      status: deployments.status,
      hostingState: deployments.hostingState,
      serverHost: deployments.serverHost,
      nodeName: hostingNodes.name,
      entitlementId: deployments.entitlementId,
      entitlementStatus: entitlements.status,
      entitlementExpiresAt: entitlements.expiresAt,
      createdAt: deployments.createdAt,
      lastDeployedAt: deployments.lastDeployedAt,
      hostedDomain: deployments.hostedDomain,
      meta: deployments.meta,
    })
    .from(deployments)
    .innerJoin(users, eq(users.id, deployments.userId))
    .innerJoin(apps, eq(apps.id, deployments.appId))
    .leftJoin(hostingNodes, eq(hostingNodes.id, deployments.hostingNodeId))
    .leftJoin(entitlements, eq(entitlements.id, deployments.entitlementId))
    .where(where)
    .orderBy(desc(deployments.createdAt), desc(deployments.id))
    .limit(q.limit)
    .offset(q.offset);
  const [total] = await db
    .select({ count: count() })
    .from(deployments)
    .innerJoin(users, eq(users.id, deployments.userId))
    .innerJoin(apps, eq(apps.id, deployments.appId))
    .where(where);
  return AdminDeploymentsSchema.parse({
    total: Number(total?.count ?? 0),
    limit: q.limit,
    offset: q.offset,
    items: rows.map(({ meta, hostedDomain, ...r }) => {
      const m = normalizeDeploymentMeta(meta);
      const domainValues = normalizeDeploymentMeta(
        normalizeDeploymentMeta(m.deliveryDomains).values,
      );
      const domains = [
        ...new Set(
          [hostedDomain, ...Object.values(domainValues)].filter(
            (v): v is string =>
              typeof v === 'string' && v.length <= 253 && /^[a-z0-9.-]+$/i.test(v),
          ),
        ),
      ];
      const reported = normalizeDeploymentMeta(m.runtimeStatusReport).lastReportedAt;
      return {
        ...r,
        domains,
        createdAt: r.createdAt.toISOString(),
        lastDeployedAt: r.lastDeployedAt?.toISOString() ?? null,
        entitlementExpiresAt: r.entitlementExpiresAt?.toISOString() ?? null,
        lastReportedAt:
          typeof reported === 'string' && Number.isFinite(Date.parse(reported))
            ? new Date(reported).toISOString()
            : null,
      };
    }),
  });
}
export const adminDeploymentRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/v1/admin/deployments',
    { preHandler: app.requirePermission('deployments.view') },
    (request) => listAdminDeployments(app.db, request.query),
  );
};
