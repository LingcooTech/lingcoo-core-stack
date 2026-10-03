import { z } from 'zod';
import { paginationSchema } from './pagination.js';

export const AuditLogSchema = z.object({
  id: z.uuid(),
  actorType: z.union([z.literal('user'), z.literal('system'), z.literal('job')]),
  actorUserId: z.union([z.string(), z.null()]),
  actorLabel: z.union([z.string(), z.null()]),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.union([z.string(), z.null()]),
  outcome: z.union([z.literal('succeeded'), z.literal('failed')]),
  summary: z.union([z.string(), z.null()]),
  ipAddress: z.union([z.string(), z.null()]),
  userAgent: z.union([z.string(), z.null()]),
  requestId: z.union([z.string(), z.null()]),
  meta: z.unknown(),
  createdAt: z.iso.datetime({ offset: true }),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

export const AuditLogsResponseSchema = paginationSchema(AuditLogSchema);

export type AuditLogsResponse = z.infer<typeof AuditLogsResponseSchema>;
