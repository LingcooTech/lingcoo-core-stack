import { z } from 'zod';
export const hostingExitEvidenceSchema = z
  .object({
    backupId: z.string().regex(/^[a-f0-9-]{36}-exit-[a-f0-9-]{36}$/),
    manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    stoppedAt: z.iso.datetime({ offset: true }),
    offsiteAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const hostingExitCommandSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('request'),
      requestKey: z.uuid(),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
  z
    .object({
      kind: z.literal('withdraw'),
      requestKey: z.uuid(),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('start'),
      requestKey: z.uuid(),
      expectedVersion: z.number().int().positive(),
      retentionDays: z.number().int().min(1).max(3650),
    })
    .strict(),
  z
    .object({
      kind: z.literal('handover'),
      requestKey: z.uuid(),
      expectedVersion: z.number().int().positive(),
      reference: z.string().trim().min(5).max(500),
    })
    .strict(),
  z
    .object({
      kind: z.literal('acknowledge'),
      requestKey: z.uuid(),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
]);
export const HostingExitSchema = z.object({
  id: z.uuid(),
  deploymentId: z.uuid(),
  state: z.enum(['requested', 'withdrawn', 'stopping', 'retained', 'completed']),
  version: z.number().int(),
  reason: z.string(),
  retentionDays: z.number().int().nullable(),
  retainUntil: z.iso.datetime({ offset: true }).nullable(),
  operationId: z.uuid().nullable(),
  evidence: hostingExitEvidenceSchema.nullable(),
  handoverReference: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const HostingExitResponseSchema = z.object({
  exit: HostingExitSchema.nullable(),
  events: z.array(
    z.object({
      kind: z.string(),
      reason: z.string().nullable(),
      actorUserId: z.uuid().nullable(),
      createdAt: z.iso.datetime({ offset: true }),
    }),
  ),
});
export type HostingExitCommand = z.infer<typeof hostingExitCommandSchema>;
export type HostingExitEvidence = z.infer<typeof hostingExitEvidenceSchema>;
