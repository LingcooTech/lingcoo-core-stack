import { z } from 'zod';
import { deliveryManifestSchema } from './delivery.js';

export const appIdentitySchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
export const repositoryPathSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (v) =>
      !v.startsWith('/') &&
      !v.includes('\\') &&
      !v.split('/').some((p) => !p || p === '.' || p === '..'),
    'Use a relative repository file path',
  );
export const gitSourceSchema = z
  .object({
    repository: z
      .string()
      .regex(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/),
    ref: z.string().trim().min(1).max(120).default('main'),
    path: repositoryPathSchema.default('stack/app.yaml'),
    connectionId: z.uuid().optional(),
  })
  .strict();
const stepSchema = z
  .object({
    service: z.string().regex(/^[a-zA-Z0-9_-]+$/),
    command: z
      .array(
        z
          .string()
          .min(1)
          .max(2000)
          .refine((v) => !v.includes('\0')),
      )
      .min(1)
      .max(50),
  })
  .strict();
const composeDeliverySchema = z
  .object({
    kind: z.literal('compose'),
    modes: z.array(z.enum(['self_hosted', 'managed'])).min(1),
    compose: z.union([repositoryPathSchema, z.record(z.string(), z.unknown())]),
    envFields: deliveryManifestSchema.shape.envFields,
    secretFields: deliveryManifestSchema.shape.secretFields,
    domainSlots: deliveryManifestSchema.shape.domainSlots,
    resources: z
      .object({
        cpuMillis: z.number().int().min(100).max(64000),
        memoryMb: z.number().int().min(128).max(262144),
        diskMb: z.number().int().min(256).max(10485760),
        serviceWeights: z
          .record(z.string().regex(/^[A-Za-z0-9_-]+$/), z.number().int().min(1).max(1000))
          .optional(),
      })
      .strict(),
    entrypoint: z
      .object({
        service: z.string().min(1),
        port: z.number().int().min(1).max(65535),
        healthPath: z.string().regex(/^\/[A-Za-z0-9/_-]*$/),
      })
      .strict(),
    lifecycle: z
      .object({
        migrate: z.array(stepSchema).max(20).default([]),
        initialize: z.array(stepSchema).max(20).default([]),
        upgradePolicy: z.enum(['same_schema', 'migration_required']),
        backup: z.array(stepSchema).max(20).default([]),
        restore: z.array(stepSchema).max(20).default([]),
      })
      .strict(),
  })
  .strict();

/** Source-owned application definition. No sales prices, platform IDs or secret values. */
export const applicationDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    app: z
      .object({
        code: appIdentitySchema,
        name: z.string().trim().min(1).max(120),
        type: z
          .enum(['web_app', 'browser_extension', 'desktop_app', 'mobile_app', 'api', 'other'])
          .default('web_app'),
        tagline: z.string().max(200).optional(),
        description: z.string().max(5000).optional(),
        content: z.string().max(50000).optional(),
        category: z.string().max(64).optional(),
        iconUrl: z.url().max(500).optional(),
        coverUrl: z.url().max(500).optional(),
        screenshots: z
          .array(
            z.object({ url: z.url().max(2048), caption: z.string().max(200).optional() }).strict(),
          )
          .max(20)
          .default([]),
        license: z.string().trim().min(1).max(120),
        acquisition: z.enum(['free', 'paid']),
      })
      .strict(),
    features: z
      .array(
        z
          .object({
            code: appIdentitySchema,
            name: z.string().min(1).max(120),
            kind: z.enum(['boolean', 'quota']).default('boolean'),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    build: z
      .object({ workflow: z.string().regex(/^[A-Za-z0-9_.-]+\.ya?ml$/) })
      .strict()
      .optional(),
    images: z
      .array(
        z
          .object({
            key: appIdentitySchema,
            repository: z.string().regex(/^[a-zA-Z0-9.-]+(?::[0-9]+)?\/[a-z0-9_./-]+$/),
            imageEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
          })
          .strict(),
      )
      .max(30)
      .default([]),
    delivery: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('none'),
          url: z.url().optional(),
          instructions: z.string().max(5000).optional(),
        })
        .strict(),
      composeDeliverySchema,
    ]),
  })
  .strict();
export type ApplicationDefinition = z.infer<typeof applicationDefinitionSchema>;
export const applicationImportSchema = z
  .object({
    source: gitSourceSchema.optional(),
    document: z.string().min(1).max(512000).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.source) !== Boolean(v.document), 'Choose a repository or a document');
export const applicationPreviewSchema = z.object({
  definition: applicationDefinitionSchema,
  definitionDigest: z.string(),
  source: gitSourceSchema.extend({ commit: z.string().regex(/^[a-f0-9]{40}$/) }).nullable(),
  warnings: z.array(z.string()),
});
export type ApplicationPreview = z.infer<typeof applicationPreviewSchema>;
export const applicationConnectionInputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('github'),
      name: z.string().min(1).max(120),
      token: z.string().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      kind: z.literal('registry'),
      name: z.string().min(1).max(120),
      host: z.string().regex(/^[a-zA-Z0-9.-]+(?::[0-9]+)?$/),
      username: z.string().min(1).max(255),
      password: z.string().min(1).max(2000),
    })
    .strict(),
]);
export const applicationConnectionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(['github', 'registry']),
  host: z.string().nullable(),
  configured: z.boolean(),
  createdAt: z.string(),
});
export const applicationReleaseInputSchema = z
  .object({
    version: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    definition: applicationDefinitionSchema,
    images: z.record(
      appIdentitySchema,
      z.string().regex(/^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/),
    ),
    notes: z.string().max(10000).default(''),
    buildUrl: z
      .string()
      .regex(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+$/)
      .optional(),
  })
  .strict();
export const applicationReleaseSchema = z.object({
  id: z.uuid(),
  version: z.string(),
  commit: z.string(),
  status: z.enum(['draft', 'published', 'withdrawn']),
  definition: applicationDefinitionSchema,
  definitionDigest: z.string(),
  images: z.record(z.string(), z.string()),
  notes: z.string(),
  buildUrl: z.string().nullable(),
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
});
export const applicationLifecycleSchema = z.object({
  source: applicationPreviewSchema.shape.source,
  definition: applicationDefinitionSchema.nullable(),
  releases: z.array(applicationReleaseSchema),
});
export const lifecycleResponseContracts = [
  {
    method: 'GET',
    path: '/v1/admin/app-connections',
    schema: z.object({ items: z.array(applicationConnectionSchema) }),
  },
  { method: 'POST', path: '/v1/admin/app-connections', schema: applicationConnectionSchema },
  {
    method: 'DELETE',
    path: '/v1/admin/app-connections/:param',
    schema: z.object({ ok: z.literal(true) }),
  },
  { method: 'POST', path: '/v1/admin/apps/import/preview', schema: applicationPreviewSchema },
  {
    method: 'POST',
    path: '/v1/admin/apps/import',
    schema: z.object({ appCode: appIdentitySchema }),
  },
  { method: 'GET', path: '/v1/admin/apps/:param/lifecycle', schema: applicationLifecycleSchema },
  { method: 'POST', path: '/v1/admin/apps/:param/releases', schema: applicationReleaseSchema },
  {
    method: 'POST',
    path: '/v1/admin/apps/:param/releases/:param/publish',
    schema: applicationReleaseSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/apps/:param/releases/:param/withdraw',
    schema: applicationReleaseSchema,
  },
] as const;
