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
    domains: deliveryManifestSchema.shape.domainSlots,
  }),
  entrypoint: delivery.shape.entrypoint,
  lifecycle: delivery.shape.lifecycle,
  volumes: z.array(z.string()),
});
export const composePlanResponseContracts = [
  {
    method: 'POST',
    path: '/v1/admin/apps/:param/releases/:param/plan',
    schema: z.object({ plan: composePlanSchema, executionEnabled: z.literal(false) }),
  },
] as const;
