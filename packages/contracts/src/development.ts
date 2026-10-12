import { z } from 'zod';
import { applicationLifecycleSchema, applicationReleaseSchema } from './app-lifecycle.js';
export const developmentProjectSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  appId: z.uuid().nullable(),
  definitionReady: z.boolean(),
  repository: z.string().nullable(),
  updatedAt: z.string(),
});
export const developmentInventoryQuerySchema = z
  .object({
    kind: z.enum(['github', 'namespaces', 'repositories', 'tags']),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    namespace: z
      .string()
      .regex(/^[A-Za-z0-9_.-]{1,255}$/)
      .optional(),
    repository: z
      .string()
      .max(255)
      .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/)
      .optional(),
    cursor: z
      .string()
      .regex(/^[\w][\w.-]{0,127}$/)
      .optional(),
    repoId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,255}$/)
      .optional(),
  })
  .strict();
export const developmentInventorySchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string().optional(),
      private: z.boolean().optional(),
      defaultBranch: z.string().optional(),
      description: z.string().nullable().optional(),
      namespace: z.string().optional(),
      repository: z.string().optional(),
      digest: z.string().optional(),
    }),
  ),
  nextPage: z.number().nullable(),
  nextCursor: z.string().nullable().optional(),
});
export const developmentResponseContracts = [
  {
    method: 'GET',
    path: '/v1/admin/development/projects',
    schema: z.object({ items: z.array(developmentProjectSchema) }),
  },
  {
    method: 'POST',
    path: '/v1/admin/development/projects',
    schema: z.object({ projectCode: z.string() }),
  },
  {
    method: 'GET',
    path: '/v1/admin/development/projects/:param',
    schema: applicationLifecycleSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/development/projects/:param/product',
    schema: z.object({ appCode: z.string() }),
  },
  {
    method: 'GET',
    path: '/v1/admin/development/connections/:param/inventory',
    schema: developmentInventorySchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/apps/:param/delivery-version',
    schema: z.object({ ok: z.literal(true) }),
  },
  {
    method: 'POST',
    path: '/v1/admin/development/projects/:param/releases',
    schema: applicationReleaseSchema,
  },
] as const;
