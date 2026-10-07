import { resolve4, resolve6 } from 'node:dns/promises';
import { dnspod } from 'tencentcloud-sdk-nodejs-dnspod';
import { isIP } from 'node:net';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { deployments } from '../../db/schema';
import { DeploymentRepository } from './repository';
import { normalizeDeploymentMeta } from './record-utils';
import { httpError } from '../../lib/errors';

type Client = Pick<
  InstanceType<typeof dnspod.v20210323.Client>,
  'DescribeRecordList' | 'CreateRecord'
>;
export class DnsPodHostingProvider {
  constructor(
    private readonly client: Client,
    private readonly zone: string,
    private readonly suffix: string,
  ) {}
  async ensureRecord(input: { deploymentId: string; hostname: string; ip: string }) {
    if (
      !this.suffix.endsWith('.' + this.zone) ||
      !input.hostname.endsWith('.' + this.suffix) ||
      !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(input.hostname.slice(0, -(this.suffix.length + 1)))
    )
      throw httpError(422, '域名不在托管子域范围内');
    if (!isIP(input.ip)) throw httpError(422, '托管节点 IP 无效');
    const name = input.hostname.slice(0, -(this.zone.length + 1));
    const owner = 'lingcoo-deployment:' + input.deploymentId;
    const type = isIP(input.ip) === 4 ? 'A' : 'AAAA';
    const response = await this.client.DescribeRecordList({
      Domain: this.zone,
      SubDomain: name,
      Limit: 100,
      ErrorOnEmpty: 'no',
    });
    const records = (response.RecordList ?? []).filter((item) => item.Name === name);
    if ((response.RecordList?.length ?? 0) >= 100) throw httpError(409, '域名记录数量异常');
    if (records.length) {
      const record = records[0]!;
      if (
        records.length !== 1 ||
        record.Remark !== owner ||
        record.Type !== type ||
        record.Value !== input.ip ||
        record.Status !== 'ENABLE' ||
        !record.RecordId
      )
        throw httpError(409, '已有域名记录与当前部署不匹配，未覆盖');
      return record.RecordId;
    }
    const created = await this.client.CreateRecord({
      Domain: this.zone,
      SubDomain: name,
      RecordType: type,
      RecordLine: '默认',
      Value: input.ip,
      TTL: 600,
      Remark: owner,
    });
    if (!created.RecordId) throw httpError(502, 'DNS 服务未返回记录标识');
    return created.RecordId;
  }
}

export class HostingDnsService {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
    private readonly provider = env.HOSTING_DNS_SECRET_ID && env.HOSTING_DNS_SECRET_KEY
      ? new DnsPodHostingProvider(
          new dnspod.v20210323.Client({
            credential: {
              secretId: env.HOSTING_DNS_SECRET_ID,
              secretKey: env.HOSTING_DNS_SECRET_KEY,
            },
            profile: { httpProfile: { endpoint: 'dnspod.tencentcloudapi.com', reqTimeout: 10 } },
          }),
          env.HOSTING_DNS_ZONE,
          env.HOSTING_DOMAIN_SUFFIX,
        )
      : null,
  ) {}

  async reconcile() {
    if (!this.provider) return { configured: false, changed: 0 };
    const pending = await this.db
      .select({ id: deployments.id })
      .from(deployments)
      .where(
        and(
          eq(deployments.deploymentMode, 'managed'),
          eq(deployments.status, 'active'),
          eq(deployments.hostingState, 'runtime_ready'),
        ),
      )
      .orderBy(asc(deployments.updatedAt))
      .limit(10);
    let changed = 0;
    for (const entry of pending) {
      await this.db.transaction(async (tx) => {
        const repository = new DeploymentRepository(tx);
        await repository.lockById(entry.id);
        const row = await repository.findDeploymentById(entry.id);
        if (!row || row.status !== 'active' || row.hostingState !== 'runtime_ready') return;
        const meta = normalizeDeploymentMeta(row.meta);
        try {
          const recordId = await this.provider!.ensureRecord({
            deploymentId: row.id,
            hostname: row.hostedDomain!,
            ip: row.serverHost!,
          });
          await repository.updateDeployment(row.id, {
            hostingState: 'pending_tls',
            meta: {
              ...meta,
              hostingDns: {
                provider: 'dnspod',
                recordId,
                zone: this.env.HOSTING_DNS_ZONE,
                hostname: row.hostedDomain,
                ip: row.serverHost,
              },
            },
          });
          changed++;
        } catch {
          // Provider messages may contain request data; persist only a non-sensitive status.
          await repository.updateDeployment(row.id, {
            meta: {
              ...meta,
              hostingDns: { status: 'retry_required', checkedAt: new Date().toISOString() },
            },
          });
        }
      });
    }
    return { configured: true, changed };
  }

  async verifyIngress(nodeId: string, deploymentId: string) {
    const repository = new DeploymentRepository(this.db);
    const row = await repository.findDeploymentById(deploymentId);
    if (
      !row ||
      row.hostingNodeId !== nodeId ||
      row.deploymentMode !== 'managed' ||
      row.status !== 'active'
    )
      throw httpError(404, '部署不属于当前节点');
    if (!['pending_tls', 'ready'].includes(row.hostingState ?? ''))
      throw httpError(409, 'DNS 尚未完成');
    const hostname = row.hostedDomain!;
    const resolved = await (isIP(row.serverHost!) === 6 ? resolve6(hostname) : resolve4(hostname));
    if (!resolved.includes(row.serverHost!)) throw httpError(409, 'DNS 尚未指向所属节点');
    await Promise.all(
      ['/health/ready', '/health/worker', '/', '/admin/'].map(async (path) => {
        const response = await fetch(`https://${hostname}${path}`, {
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
        });
        await response.body?.cancel();
        if (!response.ok || response.headers.get('x-lingcoo-deployment') !== row.id)
          throw httpError(409, '公网 HTTPS 尚未就绪或路由不匹配');
      }),
    );
    await this.db.transaction(async (tx) => {
      const locked = new DeploymentRepository(tx);
      await locked.lockById(row.id);
      const current = await locked.findDeploymentById(row.id);
      if (
        current?.hostingNodeId !== nodeId ||
        current.status !== 'active' ||
        !['pending_tls', 'ready'].includes(current.hostingState ?? '')
      )
        throw httpError(409, '部署状态已变化');
      await locked.updateDeployment(row.id, {
        hostingState: 'ready',
        lastDeployedAt: current.lastDeployedAt ?? new Date(),
      });
    });
    return { ok: true };
  }

  async listIngress(nodeId: string) {
    return this.db
      .select({ deploymentId: deployments.id, hostname: deployments.hostedDomain })
      .from(deployments)
      .where(
        and(
          eq(deployments.hostingNodeId, nodeId),
          eq(deployments.status, 'active'),
          inArray(deployments.hostingState, ['pending_tls', 'ready']),
        ),
      );
  }
}
