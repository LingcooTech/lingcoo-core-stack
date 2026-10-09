import { z } from 'zod';
import { hostingExitEvidenceSchema } from './hosting-exit.js';
export const upgradeImageSchema = z
  .string()
  .max(512)
  .regex(/^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/);
export const upgradeReleaseSchema = z
  .object({
    id: z.uuid(),
    appCode: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    label: z.string().trim().min(1).max(120),
    fromImage: upgradeImageSchema,
    toImage: upgradeImageSchema,
    schemaPolicy: z.literal('no-migration'),
    reviewEvidence: z.string().trim().min(10).max(1000),
  })
  .strict()
  .refine((r) => r.fromImage !== r.toImage, '目标镜像必须不同');
export const upgradeEvidenceSchema = z
  .object({
    operationId: z.uuid(),
    deploymentId: z.uuid(),
    releaseId: z.uuid(),
    outcome: z.enum(['upgraded', 'rolled_back', 'rejected']),
    runningImage: upgradeImageSchema,
    completedAt: z.iso.datetime({ offset: true }),
    backup: hostingExitEvidenceSchema.nullable(),
  })
  .strict();
export const UpgradeHistorySchema = z.object({
  operationId: z.uuid(),
  plan: upgradeReleaseSchema,
  evidence: upgradeEvidenceSchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export const UpgradeOptionsSchema = z.object({
  currentImage: upgradeImageSchema.nullable(),
  releases: z.array(upgradeReleaseSchema),
  blockedReason: z.string().nullable(),
  history: z.array(UpgradeHistorySchema),
});
export const upgradeRequestSchema = z
  .object({
    releaseId: z.uuid(),
    requestKey: z.uuid(),
    expectedImage: upgradeImageSchema,
    confirmDeploymentId: z.uuid(),
  })
  .strict();
