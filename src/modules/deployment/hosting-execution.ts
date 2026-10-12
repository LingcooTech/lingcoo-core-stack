import { randomUUID } from 'node:crypto';
import {
  HostingJobSchema,
  hostingResourcesSchema,
  hostingNodeReportSchema,
  type hostingCompletionSchema,
} from '@lingcoo/contracts';
import type { z } from 'zod';
import { ComposeBindingService } from './compose-binding';
import { DeploymentConfigurationUseCases } from './configuration';
import { HostingRepository, evaluateHostingNode } from './hosting';
import { DeploymentRepository } from './repository';
import { encryptJson, decryptJson } from '../../lib/settings-crypto';
import { httpError } from '../../lib/errors';

/** Node-scoped, replayable execution. Public readiness is a separate DNS/TLS gate. */
export class HostingExecutionService extends DeploymentConfigurationUseCases {
  async claim(input: { nodeId: string; token: string }) {
    return this.db.transaction(async (tx) => {
      const service = new HostingExecutionService(this.capabilities, tx, this.env);
      const hosting = new HostingRepository(tx);
      const node = await hosting.authenticate(input.nodeId, input.token);
      await hosting.lockPool();
      if (!node.enabled) return { job: null };
      const row = await hosting.nextExecution(node.id);
      if (!row) return { job: null };
      const { entitlement } = await service.loadDeploymentEntitlement(row);
      const meta = service.normalizeMeta(row.meta);
      const installation = await new ComposeBindingService(tx, this.env).readJob(row.id);
      if (
        installation &&
        !hostingNodeReportSchema
          .safeParse(node.report)
          .data?.supportedProtocols?.includes('compose_install_v1')
      )
        return { job: null };
      if (row.hostingState === 'deploying') {
        const execution = service.normalizeMeta(meta.hostingExecution);
        return {
          job: HostingJobSchema.parse(
            decryptJson(execution.payload, service.getEncryptionSecret()),
          ),
        };
      }
      const resources = hostingResourcesSchema.parse(row.hostingResources);
      if (
        installation &&
        (Object.keys(resources) as (keyof typeof resources)[]).some(
          (key) => resources[key] !== installation.resources[key],
        )
      )
        throw httpError(409, '固定交付版本与预留资源不一致');
      // Re-check immediately before starting; reports must still have enough actual headroom.
      if (
        evaluateHostingNode(
          node,
          { cpuMillis: 0, memoryMb: 0, diskMb: 0 },
          resources,
          this.capabilities.now(),
        ) === null
      )
        return { job: null };
      const [view] = await service.hydrateDeployments([row]);
      const app = await this.capabilities.createAppService(tx).getPublicApp(view?.app?.code ?? '');
      await service.ensureDeploymentReadyForTokenIssue({ app, deployment: row });
      const policy = service.readEntitlementDeploymentPolicy(entitlement);
      const bound = await service.bindDeploymentDomainOnExchange({
        deployment: row,
        entitlementId: entitlement.id,
        policy,
      });
      const bootstrap = await service.buildBootstrapPayload({
        app,
        deployment: bound,
        entitlement,
      });
      const job = HostingJobSchema.parse({
        id: randomUUID(),
        deploymentId: row.id,
        appCode: app.code,
        hostname: row.hostedDomain,
        resources,
        env: bootstrap.envDefaults,
        ...(installation ? { installation } : {}),
      });
      const repository = new DeploymentRepository(tx);
      const refreshed = await repository.findDeploymentById(row.id);
      await repository.updateDeployment(row.id, {
        hostingState: 'deploying',
        meta: {
          ...service.normalizeMeta(refreshed?.meta),
          hostingExecution: {
            jobId: job.id,
            startedAt: this.capabilities.now().toISOString(),
            payload: encryptJson(job, service.getEncryptionSecret()),
          },
        },
      });
      return { job };
    });
  }

  async complete(
    input: z.infer<typeof hostingCompletionSchema> & { nodeId: string; token: string },
  ) {
    return this.db.transaction(async (tx) => {
      const service = new HostingExecutionService(this.capabilities, tx, this.env);
      const hosting = new HostingRepository(tx);
      await hosting.authenticate(input.nodeId, input.token);
      await hosting.lockPool();
      const repository = new DeploymentRepository(tx);
      await repository.lockById(input.deploymentId);
      const row = await repository.findDeploymentById(input.deploymentId);
      if (!row || row.deploymentMode !== 'managed' || row.hostingNodeId !== input.nodeId)
        throw httpError(404, '部署不属于当前节点');
      const meta = service.normalizeMeta(row.meta);
      const execution = service.normalizeMeta(meta.hostingExecution);
      if (execution.jobId !== input.jobId) throw httpError(409, '部署任务已变化');
      const target = input.success ? 'runtime_ready' : 'failed';
      if (row.hostingState === target) return { ok: true };
      if (row.status !== 'active' || row.hostingState !== 'deploying')
        throw httpError(409, '任务状态不允许完成');
      const job = HostingJobSchema.parse(
        decryptJson(execution.payload, service.getEncryptionSecret()),
      );
      if (input.success && job.installation) {
        const evidence = input.composeEvidence;
        const expectedSteps = ['migrate', 'initialize'].flatMap((operation) =>
          job.installation!.lifecycle[operation as 'migrate' | 'initialize'].map(
            (_, i) => `${operation}:${i}`,
          ),
        );
        if (
          !evidence ||
          evidence.instanceId !== row.id ||
          evidence.releaseId !== job.installation.releaseId ||
          evidence.releaseDigest !== job.installation.releaseDigest ||
          evidence.phase !== 'runtime_ready' ||
          evidence.runnerVersion !== '1' ||
          evidence.protocol !== 'compose_install_v1' ||
          JSON.stringify(evidence.completed) !== JSON.stringify(expectedSteps)
        )
          throw httpError(409, '运行验收与固定交付版本不一致');
      } else if (
        input.success &&
        (!job.env.APP_IMAGE || !input.image || input.image !== job.env.APP_IMAGE)
      )
        throw httpError(409, '实际镜像与任务不一致');
      // Keep failed configuration encrypted for explicit recovery. Never free capacity on failure.
      await repository.updateDeployment(row.id, {
        hostingState: target,
        meta: {
          ...meta,
          hostingExecution: {
            ...execution,
            completedAt: this.capabilities.now().toISOString(),
            ...(input.success && job.installation
              ? { composeEvidence: input.composeEvidence }
              : {}),
          },
        },
      });
      return { ok: true };
    });
  }
}
