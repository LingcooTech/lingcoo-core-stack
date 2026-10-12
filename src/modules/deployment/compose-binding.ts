import { randomBytes } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import { composePlanSchema, composeInstallJobSchema } from '@lingcoo/contracts';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { deploymentComposeBindings, deploymentComposeRequests, deployments } from '../../db/schema';
import { acquireTransactionLock } from '../../db/locks';
import {
  decryptJson,
  encryptJson,
  getEncryptionKeys,
  type EncryptionKeyring,
} from '../../lib/settings-crypto';
import { httpError } from '../../lib/errors';
import {
  compileComposePlan,
  materializeComposePlan,
  readPublishedComposeRelease,
  type ComposePlan,
} from '../app/public';

export type ComposeConfiguration = Record<string, string | boolean>;

export function prepareComposeConfiguration(plan: ComposePlan, input: ComposeConfiguration) {
  const configuration = { ...input };
  for (const field of plan.fields.generatedSecrets ?? []) {
    if (Object.hasOwn(input, field.key))
      throw httpError(422, 'Generated secrets cannot be overridden');
    configuration[field.key] = randomBytes(field.bytes).toString(field.encoding);
  }
  return configuration;
}

/** Private node payload. Never return it from list, preview or customer response APIs. */
export function composeInstallJob(
  plan: ComposePlan,
  configuration: ComposeConfiguration,
  port: number,
) {
  if (
    (plan.lifecycle.migrate.length || plan.lifecycle.initialize.length) &&
    !plan.lifecycle.infrastructure
  )
    throw httpError(422, 'Initialization requires an explicit infrastructure service list');
  return composeInstallJobSchema.parse({
    protocol: 'compose_install_v1' as const,
    instanceId: plan.instanceId,
    releaseId: plan.releaseId,
    releaseDigest: plan.releaseDigest,
    mode: plan.mode,
    resources: plan.resources,
    services: plan.services,
    volumes: plan.volumes,
    entrypoint: plan.entrypoint,
    ...materializeComposePlan(plan, configuration, port),
  });
}

/** Transactional preparation only. Scheduling, entitlement checks and ingress are outer gates. */
export class ComposeBindingService {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
  ) {}

  /** Fix a release and generated configuration before a waiting instance owns a server. */
  async pin(deploymentId: string, releaseId: string, input: ComposeConfiguration) {
    return this.db.transaction(async (tx) => {
      const [instance] = await tx
        .select()
        .from(deployments)
        .where(eq(deployments.id, deploymentId))
        .for('update');
      if (!instance || instance.status !== 'active')
        throw httpError(404, 'Active deployment not found');
      const [existing] = await tx
        .select()
        .from(deploymentComposeRequests)
        .where(eq(deploymentComposeRequests.deploymentId, deploymentId));
      const keys = getEncryptionKeys(this.env);
      if (existing) {
        const saved = decryptJson<{ input: ComposeConfiguration }>(existing.configuration, keys);
        if (
          existing.releaseId !== releaseId ||
          Object.keys(input).length !== Object.keys(saved.input).length ||
          Object.keys(input).some((key) => input[key] !== saved.input[key])
        )
          throw httpError(409, 'Requested installation is immutable');
        return composePlanSchema.parse(existing.plan);
      }
      const [binding] = await tx
        .select()
        .from(deploymentComposeBindings)
        .where(eq(deploymentComposeBindings.deploymentId, deploymentId));
      if (instance.lastDeployedAt || binding)
        throw httpError(409, 'Existing installations require an explicit migration');
      if (!['self_hosted', 'managed'].includes(instance.deploymentMode))
        throw httpError(422, 'Unsupported deployment mode');
      const release = await readPublishedComposeRelease(tx, instance.appId, releaseId);
      const plan = compileComposePlan(release, {
        instanceId: deploymentId,
        mode: instance.deploymentMode as 'managed' | 'self_hosted',
      });
      const values = prepareComposeConfiguration(plan, input);
      // Validate fields and lifecycle now; this dummy port does not reserve or start anything.
      composeInstallJob(plan, values, 24000);
      await tx.insert(deploymentComposeRequests).values({
        deploymentId,
        releaseId,
        plan,
        configuration: encryptJson({ input, values }, keys),
      });
      return plan;
    });
  }

  async preparePinned(deploymentId: string) {
    const [request] = await this.db
      .select()
      .from(deploymentComposeRequests)
      .where(eq(deploymentComposeRequests.deploymentId, deploymentId));
    if (!request) return null;
    const saved = decryptJson<{ input: ComposeConfiguration }>(
      request.configuration,
      getEncryptionKeys(this.env),
    );
    return this.prepareAllocated(deploymentId, request.releaseId, saved.input);
  }

  /** Only authenticated deployment execution callers may consume this secret payload. */
  async readJob(deploymentId: string) {
    const [binding] = await this.db
      .select()
      .from(deploymentComposeBindings)
      .where(eq(deploymentComposeBindings.deploymentId, deploymentId));
    if (!binding) return null;
    const saved = decryptJson<{ input: ComposeConfiguration }>(
      binding.configuration,
      getEncryptionKeys(this.env),
    );
    return this.prepare(deploymentId, binding.releaseId, saved.input, binding.loopbackPort);
  }

  /** Reserve per-server ports under the same lock used by explicit preparation.
   * Retired instances retain reservations until their binding is reclaimed.
   * The runner still checks the actual socket: unrelated host processes are not
   * represented in the platform database and must never be evicted.
   */
  async prepareAllocated(
    deploymentId: string,
    releaseId: string,
    input: ComposeConfiguration,
    range = { start: 24000, end: 29999 },
  ) {
    if (
      !Number.isInteger(range.start) ||
      !Number.isInteger(range.end) ||
      range.start < 1024 ||
      range.end > 65535 ||
      range.start > range.end
    )
      throw httpError(422, 'Invalid installation port range');
    return this.db.transaction(async (tx) => {
      const [instance] = await tx
        .select()
        .from(deployments)
        .where(eq(deployments.id, deploymentId))
        .for('update');
      if (!instance || instance.status !== 'active')
        throw httpError(404, 'Active deployment not found');
      if (
        !instance.serverHost ||
        (instance.deploymentMode === 'managed' && !instance.hostingNodeId)
      )
        throw httpError(409, 'Allocate a server before preparing installation');
      await acquireTransactionLock(tx, 'deployment:compose:server:' + instance.serverHost);
      const [existing] = await tx
        .select()
        .from(deploymentComposeBindings)
        .where(eq(deploymentComposeBindings.deploymentId, deploymentId));
      const occupied = await tx
        .select({ port: deploymentComposeBindings.loopbackPort })
        .from(deploymentComposeBindings)
        .where(eq(deploymentComposeBindings.serverHost, instance.serverHost));
      const used = new Set(occupied.map((row) => row.port));
      let port = existing?.loopbackPort ?? range.start;
      if (!existing) {
        while (port <= range.end && used.has(port)) port++;
        if (port > range.end) throw httpError(409, 'Installation port capacity exhausted');
      }
      return new ComposeBindingService(tx, this.env).prepare(deploymentId, releaseId, input, port);
    });
  }

  async prepare(
    deploymentId: string,
    releaseId: string,
    input: ComposeConfiguration,
    port: number,
  ) {
    return this.db.transaction(async (tx) => {
      const [instance] = await tx
        .select()
        .from(deployments)
        .where(eq(deployments.id, deploymentId))
        .for('update');
      if (!instance || instance.status !== 'active')
        throw httpError(404, 'Active deployment not found');
      if (!Number.isInteger(port) || port < 1024 || port > 65535)
        throw httpError(422, 'Invalid installation port');
      if (instance.serverHost) {
        await acquireTransactionLock(tx, 'deployment:compose:server:' + instance.serverHost);
        const occupied = await tx
          .select({ id: deploymentComposeBindings.deploymentId })
          .from(deploymentComposeBindings)
          .where(
            and(
              eq(deploymentComposeBindings.serverHost, instance.serverHost),
              eq(deploymentComposeBindings.loopbackPort, port),
              ne(deploymentComposeBindings.deploymentId, deploymentId),
            ),
          )
          .limit(1);
        if (occupied.length) throw httpError(409, 'Installation port already reserved');
      }
      const [existing] = await tx
        .select()
        .from(deploymentComposeBindings)
        .where(eq(deploymentComposeBindings.deploymentId, deploymentId));
      const keys = getEncryptionKeys(this.env);
      if (existing) {
        if (existing.releaseId !== releaseId || existing.loopbackPort !== port)
          throw httpError(
            409,
            'Installation binding is immutable; use an explicit upgrade or migration',
          );
        const saved = decryptJson<{
          input: ComposeConfiguration;
          values: ComposeConfiguration;
          serverHost?: string | null;
          hostingNodeId?: string | null;
        }>(existing.configuration, keys);
        if (
          (Object.hasOwn(saved, 'serverHost') && saved.serverHost !== instance.serverHost) ||
          (Object.hasOwn(saved, 'hostingNodeId') && saved.hostingNodeId !== instance.hostingNodeId)
        )
          throw httpError(409, 'Installation server changed; use an explicit migration');
        if (
          Object.keys(input).length !== Object.keys(saved.input).length ||
          Object.keys(input).some((key) => input[key] !== saved.input[key])
        )
          throw httpError(409, 'Installation configuration is immutable');
        const plan = composePlanSchema.parse(existing.plan) as ComposePlan;
        if (
          plan.instanceId !== instance.id ||
          plan.mode !== instance.deploymentMode ||
          plan.releaseId !== existing.releaseId
        )
          throw httpError(409, 'Installation identity changed');
        return composeInstallJob(plan, saved.values, port);
      }
      if (instance.lastDeployedAt)
        throw httpError(409, 'Existing installations require an explicit migration');
      if (!['managed', 'self_hosted'].includes(instance.deploymentMode))
        throw httpError(422, 'Unsupported deployment mode');
      const [request] = await tx
        .select()
        .from(deploymentComposeRequests)
        .where(eq(deploymentComposeRequests.deploymentId, deploymentId));
      const saved = request
        ? decryptJson<{ input: ComposeConfiguration; values: ComposeConfiguration }>(
            request.configuration,
            keys,
          )
        : null;
      if (
        request &&
        (request.releaseId !== releaseId ||
          Object.keys(input).length !== Object.keys(saved!.input).length ||
          Object.keys(input).some((key) => input[key] !== saved!.input[key]))
      )
        throw httpError(409, 'Requested installation is immutable');
      const plan = request
        ? composePlanSchema.parse(request.plan)
        : compileComposePlan(await readPublishedComposeRelease(tx, instance.appId, releaseId), {
            instanceId: deploymentId,
            mode: instance.deploymentMode as 'managed' | 'self_hosted',
          });
      if (
        plan.instanceId !== instance.id ||
        plan.mode !== instance.deploymentMode ||
        plan.releaseId !== releaseId
      )
        throw httpError(409, 'Requested installation identity changed');
      const values = saved?.values ?? prepareComposeConfiguration(plan, input);
      const job = composeInstallJob(plan, values, port);
      await tx.insert(deploymentComposeBindings).values({
        deploymentId,
        releaseId,
        plan,
        loopbackPort: port,
        serverHost: instance.serverHost,
        configuration: encryptJson(
          { input, values, serverHost: instance.serverHost, hostingNodeId: instance.hostingNodeId },
          keys,
        ),
      });
      return job;
    });
  }
}

export async function rotateComposeBindingKeys(
  db: DbExecutor,
  keys: EncryptionKeyring,
  dryRun: boolean,
) {
  let checked = 0,
    rotated = 0;
  for (const table of [deploymentComposeRequests, deploymentComposeBindings]) {
    for (const row of await db.select().from(table).for('update')) {
      checked++;
      const plain = decryptJson(row.configuration, keys);
      const envelope = row.configuration as { version?: number; keyId?: string };
      if (envelope.version === 2 && envelope.keyId === keys.currentKeyId) continue;
      rotated++;
      if (!dryRun) {
        const configuration = encryptJson(plain, keys);
        if (table === deploymentComposeRequests)
          await db
            .update(deploymentComposeRequests)
            .set({ configuration })
            .where(eq(deploymentComposeRequests.deploymentId, row.deploymentId));
        else
          await db
            .update(deploymentComposeBindings)
            .set({ configuration })
            .where(eq(deploymentComposeBindings.deploymentId, row.deploymentId));
      }
    }
  }
  return { checked, rotated };
}
