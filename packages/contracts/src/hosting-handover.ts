import { z } from 'zod';
export const HandoverViewSchema = z.object({
  id: z.uuid(),
  state: z.enum(['preparing', 'ready', 'revoked']),
  sha256: z.string().nullable(),
  size: z.number().nullable(),
  received: z.number(),
  expiresAt: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
});
export const HandoverListSchema = z.object({
  items: z.array(HandoverViewSchema),
  reclamation: z
    .object({
      state: z.enum(['pending', 'completed']),
      completedAt: z.iso.datetime({ offset: true }).nullable(),
    })
    .nullable(),
});
export const handoverCommandSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('prepare'),
      requestKey: z.uuid(),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
  z.object({ kind: z.literal('revoke'), handoverId: z.uuid() }).strict(),
  z.object({ kind: z.literal('grant'), handoverId: z.uuid() }).strict(),
  z.object({ kind: z.literal('key'), handoverId: z.uuid() }).strict(),
  z
    .object({
      kind: z.literal('reclaim'),
      requestKey: z.uuid(),
      expectedVersion: z.number().int().positive(),
      confirmDeploymentId: z.uuid(),
    })
    .strict(),
]);
export const HandoverResultSchema = z.object({
  ok: z.literal(true),
  downloadPath: z.string().optional(),
  identity: z.string().optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});
export const reclamationEvidenceSchema = z
  .object({
    deploymentId: z.uuid(),
    operationId: z.uuid(),
    backupId: z.string(),
    completedAt: z.iso.datetime({ offset: true }),
    removedContainers: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(50),
    removedVolumes: z.array(z.string().max(200)).max(50),
  })
  .strict();
