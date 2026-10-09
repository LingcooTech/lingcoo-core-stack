import { probeHostedHttps, loadHostedProbePaths } from './https-probe';
import { randomBytes } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { customHostnameSchema, type DeploymentDomain } from '@lingcoo/contracts';
import { deploymentDomains, deployments } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { HostingRepository } from './hosting';

type DomainDns = {
  resolve4: (hostname: string) => Promise<string[]>;
  resolve6: (hostname: string) => Promise<string[]>;
  resolveCname: (hostname: string) => Promise<string[]>;
  resolveTxt: (hostname: string) => Promise<string[][]>;
};
const resolver = new Resolver({ timeout: 2000, tries: 1 });
const defaultDns: DomainDns = {
  resolve4: resolver.resolve4.bind(resolver),
  resolve6: resolver.resolve6.bind(resolver),
  resolveCname: resolver.resolveCname.bind(resolver),
  resolveTxt: resolver.resolveTxt.bind(resolver),
};
type DomainRow = typeof deploymentDomains.$inferSelect;
export class CustomDomainService {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
    private readonly dns: DomainDns = defaultDns,
    private readonly request = probeHostedHttps,
  ) {}

  private async owned(deploymentId: string, userId: string) {
    const [row] = await this.db
      .select()
      .from(deployments)
      .where(and(eq(deployments.id, deploymentId), eq(deployments.userId, userId)));
    if (!row) throw httpError(404, '部署不存在');
    if (row.deploymentMode !== 'managed' || row.status !== 'active')
      throw httpError(409, '仅有效托管实例支持域名管理');
    return row;
  }
  private view(row: DomainRow, deployment: typeof deployments.$inferSelect): DeploymentDomain {
    return {
      id: row.id,
      hostname: row.hostname,
      state: row.state as DeploymentDomain['state'],
      verificationName: '_lingcoo.' + row.hostname,
      verificationValue: row.verificationToken,
      cnameTarget: deployment.hostedDomain!,
      ipv4Target: isIP(deployment.serverHost ?? '') === 4 ? deployment.serverHost : null,
      accessUrl: row.state === 'ready' ? 'https://' + row.hostname : null,
    };
  }
  async list(deploymentId: string, userId: string) {
    const deployment = await this.owned(deploymentId, userId);
    return {
      items: (
        await this.db
          .select()
          .from(deploymentDomains)
          .where(eq(deploymentDomains.deploymentId, deploymentId))
      ).map((row) => this.view(row, deployment)),
    };
  }
  async add(deploymentId: string, userId: string, raw: string) {
    const hostname = customHostnameSchema.parse(raw);
    const suffix = this.env.HOSTING_DOMAIN_SUFFIX;
    const control = new URL(this.env.PUBLIC_BASE_URL).hostname;
    if (
      hostname === suffix ||
      hostname.endsWith('.' + suffix) ||
      hostname === control ||
      hostname === this.env.HOSTING_DNS_ZONE
    )
      throw httpError(422, '平台保留域名不可绑定');
    return this.db.transaction(async (tx) => {
      await new HostingRepository(tx).lockPool();
      const service = new CustomDomainService(tx, this.env, this.dns, this.request);
      const deployment = await service.owned(deploymentId, userId);
      const existing = await tx
        .select()
        .from(deploymentDomains)
        .where(eq(deploymentDomains.hostname, hostname));
      if (existing.length) {
        if (existing[0]!.deploymentId === deploymentId)
          return service.view(existing[0]!, deployment);
        throw httpError(409, '域名已被其他实例占用');
      }
      const current = await tx
        .select({ id: deploymentDomains.id })
        .from(deploymentDomains)
        .where(eq(deploymentDomains.deploymentId, deploymentId));
      if (current.length >= 5) throw httpError(409, '每个实例最多绑定 5 个自定义域名');
      const [created] = await tx
        .insert(deploymentDomains)
        .values({
          deploymentId,
          hostname,
          verificationToken: 'lingcoo-verification=' + randomBytes(24).toString('hex'),
        })
        .returning();
      return service.view(created!, deployment);
    });
  }
  async verify(deploymentId: string, userId: string, domainId: string) {
    const deployment = await this.owned(deploymentId, userId);
    const [row] = await this.db
      .select()
      .from(deploymentDomains)
      .where(
        and(eq(deploymentDomains.id, domainId), eq(deploymentDomains.deploymentId, deploymentId)),
      );
    if (!row) throw httpError(404, '域名不存在');
    if (row.state === 'removing') throw httpError(409, '域名正在解绑');
    if (!deployment.serverHost || deployment.hostingState !== 'ready')
      throw httpError(409, '请等待默认域名部署就绪');
    try {
      const txt = await this.dns.resolveTxt('_lingcoo.' + row.hostname);
      if (!txt.some((parts) => parts.join('') === row.verificationToken))
        throw new Error('ownership');
      const addresses = (
        await Promise.all([
          this.dns.resolve4(row.hostname).catch(() => []),
          this.dns.resolve6(row.hostname).catch(() => []),
        ])
      ).flat();
      if (!addresses.length || addresses.some((ip) => ip !== deployment.serverHost))
        throw new Error('target');
      const cnames = await this.dns.resolveCname(row.hostname).catch(() => []);
      if (
        cnames.length &&
        !cnames.some((name) => name.replace(/\.$/, '').toLowerCase() === deployment.hostedDomain)
      )
        throw new Error('cname');
    } catch {
      throw httpError(409, 'DNS 尚未通过：请检查 TXT 归属记录和 CNAME/A 目标，等待解析生效后重试');
    }
    const [updated] = await this.db
      .update(deploymentDomains)
      .set({ state: row.state === 'ready' ? 'ready' : 'pending_tls', updatedAt: new Date() })
      .where(
        and(
          eq(deploymentDomains.id, row.id),
          eq(deploymentDomains.verificationToken, row.verificationToken),
          inArray(deploymentDomains.state, ['pending_dns', 'pending_tls', 'ready']),
        ),
      )
      .returning();
    if (!updated) throw httpError(409, '域名状态已变化，请刷新');
    return this.view(updated, deployment);
  }
  async remove(deploymentId: string, userId: string, domainId: string) {
    await this.owned(deploymentId, userId);
    // Keep the unique reservation until the node acknowledges removal from its gateway.
    await this.db
      .update(deploymentDomains)
      .set({ state: 'removing', updatedAt: new Date() })
      .where(
        and(eq(deploymentDomains.id, domainId), eq(deploymentDomains.deploymentId, deploymentId)),
      );
    return { ok: true };
  }
  async nodeComplete(nodeId: string, deploymentId: string, domainId: string, removed = false) {
    const [deployment] = await this.db
      .select()
      .from(deployments)
      .where(
        and(
          eq(deployments.id, deploymentId),
          eq(deployments.hostingNodeId, nodeId),
          eq(deployments.status, 'active'),
        ),
      );
    if (!deployment) throw httpError(404, '部署不属于当前节点');
    const [row] = await this.db
      .select()
      .from(deploymentDomains)
      .where(
        and(eq(deploymentDomains.id, domainId), eq(deploymentDomains.deploymentId, deploymentId)),
      );
    if (!row) return { ok: true };
    if (row.state === 'removing') {
      if (!removed) throw httpError(409, '请先移除节点路由');
      await this.db
        .delete(deploymentDomains)
        .where(and(eq(deploymentDomains.id, domainId), eq(deploymentDomains.state, 'removing')));
      return { ok: true };
    }
    if (removed) throw httpError(409, '域名尚未请求删除');
    if (!['pending_tls', 'ready'].includes(row.state)) throw httpError(409, '域名尚未完成归属验证');
    await this.verify(deploymentId, deployment.userId, domainId);
    await this.request(
      row.hostname,
      deployment.serverHost!,
      deploymentId,
      await loadHostedProbePaths(this.db, deployment.appId),
    );
    await this.db
      .update(deploymentDomains)
      .set({ state: 'ready', updatedAt: new Date() })
      .where(
        and(
          eq(deploymentDomains.id, domainId),
          inArray(deploymentDomains.state, ['pending_tls', 'ready']),
        ),
      );
    return { ok: true };
  }
  async reconcile() {
    const rows = await this.db
      .select({
        id: deploymentDomains.id,
        deploymentId: deployments.id,
        userId: deployments.userId,
      })
      .from(deploymentDomains)
      .innerJoin(deployments, eq(deployments.id, deploymentDomains.deploymentId))
      .where(and(eq(deploymentDomains.state, 'pending_dns'), eq(deployments.status, 'active')))
      .orderBy(asc(deploymentDomains.updatedAt))
      .limit(50);
    for (const row of rows) {
      try {
        await this.verify(row.deploymentId, row.userId, row.id);
      } catch {
        // Rotate unresolved entries so one batch of missing DNS records cannot starve later customers.
        await this.db
          .update(deploymentDomains)
          .set({ updatedAt: new Date() })
          .where(and(eq(deploymentDomains.id, row.id), eq(deploymentDomains.state, 'pending_dns')));
      }
    }
  }
}
