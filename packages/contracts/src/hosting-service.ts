import { z } from 'zod';

export const hostingServiceCommandSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('register'),
      requestKey: z.uuid(),
      expectedVersion: z.literal(0),
      source: z.enum(['trial', 'manual']),
      interval: z.enum(['month', 'year']),
      periods: z.number().int().min(1).max(120),
      graceDays: z.number().int().min(0).max(90),
      retentionDays: z.number().int().min(1).max(3650),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
  z
    .object({
      kind: z.literal('extend'),
      requestKey: z.uuid(),
      expectedVersion: z.number().int().min(1),
      periods: z.number().int().min(1).max(120),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
]);
export type HostingServiceCommand = z.infer<typeof hostingServiceCommandSchema>;
export const HostingServiceSchema = z.object({
  id: z.uuid(),
  deploymentId: z.uuid(),
  source: z.enum(['trial', 'manual', 'paid']),
  interval: z.enum(['month', 'year']),
  periods: z.number().int(),
  state: z.enum(['pending_delivery', 'active', 'grace', 'expired']),
  anchorAt: z.iso.datetime({ offset: true }).nullable(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  graceEndsAt: z.iso.datetime({ offset: true }).nullable(),
  graceDays: z.number().int(),
  retentionDays: z.number().int(),
  version: z.number().int(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type HostingService = z.infer<typeof HostingServiceSchema>;
export const HostingServiceResponseSchema = z.object({ service: HostingServiceSchema.nullable() });
export const AdminHostingServiceResponseSchema = HostingServiceResponseSchema.extend({
  changes: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(['register', 'extend', 'activate']),
      actorUserId: z.uuid().nullable(),
      reason: z.string(),
      version: z.number().int(),
      createdAt: z.iso.datetime({ offset: true }),
      before: HostingServiceSchema.nullable(),
      after: HostingServiceSchema,
    }),
  ),
});
