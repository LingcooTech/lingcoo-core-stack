import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { composePlanSchema } from '@lingcoo/contracts';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { deploymentComposeBindings, deployments } from '../../db/schema';
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
  return {
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
  };
}

/** Transactional preparation only. Scheduling, entitlement checks and ingress are outer gates. */
export class ComposeBindingService {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
  ) {}

  async prepare(
    deploymentId: string,
    releaseId: string,
    input: ComposeConfiguration,
    port: number,
  ) {
    return this.db.transaction(async (tx) => {
      await acquireTransactionLock(tx, 'deployment:compose:' + deploymentId);
      const [instance] = await tx
        .select()
        .from(deployments)
        .where(eq(deployments.id, deploymentId))
        .for('update');
      if (!instance || instance.status !== 'active')
        throw httpError(404, 'Active deployment not found');
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
        const saved = decryptJson<{ input: ComposeConfiguration; values: ComposeConfiguration }>(
          existing.configuration,
          keys,
        );
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
      const release = await readPublishedComposeRelease(tx, instance.appId, releaseId);
      const plan = compileComposePlan(release, {
        instanceId: deploymentId,
        mode: instance.deploymentMode as 'managed' | 'self_hosted',
      });
      const values = prepareComposeConfiguration(plan, input);
      const job = composeInstallJob(plan, values, port);
      await tx.insert(deploymentComposeBindings).values({
        deploymentId,
        releaseId,
        plan,
        loopbackPort: port,
        configuration: encryptJson({ input, values }, keys),
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
  for (const row of await db.select().from(deploymentComposeBindings).for('update')) {
    checked++;
    const plain = decryptJson(row.configuration, keys);
    const envelope = row.configuration as { version?: number; keyId?: string };
    if (envelope.version === 2 && envelope.keyId === keys.currentKeyId) continue;
    rotated++;
    if (!dryRun)
      await db
        .update(deploymentComposeBindings)
        .set({ configuration: encryptJson(plain, keys) })
        .where(eq(deploymentComposeBindings.deploymentId, row.deploymentId));
  }
  return { checked, rotated };
}
