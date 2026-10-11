import { z } from 'zod';
import { applicationPreviewSchema, applicationReleaseSchema } from './app-lifecycle.js';
export const publishingTokenSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  configured: z.boolean(),
  revoked: z.boolean(),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export const buildRequestInputSchema = z
  .object({ requestId: z.uuid(), version: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/) })
  .strict();
export const buildRequestSchema = z.object({
  id: z.uuid(),
  version: z.string(),
  commit: z.string(),
  status: z.enum(['dispatching', 'dispatched', 'failed', 'unknown']),
  createdAt: z.string(),
});
export const workflowRunViewSchema = z.object({
  id: z.number(),
  commit: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  url: z.url(),
  title: z.string(),
  createdAt: z.string(),
});
export const appPublishingResponseContracts = [
  { method: 'PUT', path: '/v1/admin/apps/:param/source', schema: applicationPreviewSchema },
  {
    method: 'GET',
    path: '/v1/admin/apps/:param/builds',
    schema: z.object({
      requests: z.array(buildRequestSchema),
      runs: z.array(workflowRunViewSchema),
      connected: z.boolean(),
    }),
  },
  { method: 'POST', path: '/v1/admin/apps/:param/builds', schema: buildRequestSchema },
  {
    method: 'GET',
    path: '/v1/admin/apps/:param/publishing-tokens',
    schema: z.object({ items: z.array(publishingTokenSchema) }),
  },
  {
    method: 'POST',
    path: '/v1/admin/apps/:param/publishing-tokens',
    schema: z.object({ token: z.string(), record: publishingTokenSchema }),
  },
  {
    method: 'DELETE',
    path: '/v1/admin/apps/:param/publishing-tokens/:param',
    schema: z.object({ ok: z.literal(true) }),
  },
  { method: 'POST', path: '/v1/publishing/apps/:param/releases', schema: applicationReleaseSchema },
] as const;
