import { z } from 'zod';
import { applicationDefinitionSchema, appIdentitySchema } from './app-lifecycle.js';
import { deliveryManifestSchema } from './delivery.js';

const delivery = applicationDefinitionSchema.shape.delivery.options[1];
export const composePlanInputSchema = z
  .object({
    instanceId: z.uuid(),
    mode: z.enum(['self_hosted', 'managed']),
  })
  .strict();
export const composePlanSchema = z.object({
  protocol: z.literal('compose_v1'),
  appCode: appIdentitySchema,
  releaseId: z.uuid(),
  version: z.string(),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  definitionDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  releaseDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  instanceId: z.uuid(),
  project: z.string().regex(/^stack-[a-f0-9]{32}$/),
  mode: z.enum(['self_hosted', 'managed']),
  resources: delivery.shape.resources,
  imageVariables: z.record(z.string(), z.string()),
  services: z.array(
    z.object({
      name: z.string(),
      image: z.string(),
      cpuMillis: z.number().int().positive(),
      memoryMb: z.number().int().positive(),
    }),
  ),
  compose: z.record(z.string(), z.unknown()),
  fields: z.object({
    env: deliveryManifestSchema.shape.envFields,
    secrets: deliveryManifestSchema.shape.secretFields,
    generatedSecrets: delivery.shape.generatedSecrets,
    domains: deliveryManifestSchema.shape.domainSlots,
  }),
  entrypoint: delivery.shape.entrypoint,
  lifecycle: delivery.shape.lifecycle,
  volumes: z.array(z.string()),
});
/** Private authenticated execution payload; never include in customer list projections. */
export const composeInstallJobSchema = composePlanSchema
  .pick({
    instanceId: true,
    releaseId: true,
    releaseDigest: true,
    mode: true,
    resources: true,
    services: true,
    volumes: true,
    entrypoint: true,
    project: true,
    lifecycle: true,
    compose: true,
  })
  .extend({
    protocol: z.literal('compose_install_v1'),
    healthUrl: z.string().url(),
  })
  .strict();

export const composeExecutionEvidenceSchema = z
  .object({
    protocol: z.literal('compose_install_v1'),
    instanceId: z.uuid(),
    releaseId: z.uuid(),
    releaseDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    phase: z.literal('runtime_ready'),
    runnerVersion: z.literal('1'),
    imageSource: z.enum(['cache', 'registry']),
    completed: z.array(z.string().regex(/^(migrate|initialize):\d+$/)).max(128),
  })
  .strict();
export const composePlanResponseContracts = [
  {
    method: 'POST',
    path: '/v1/admin/apps/:param/releases/:param/plan',
    schema: z.object({ plan: composePlanSchema, executionEnabled: z.literal(false) }),
  },
] as const;
