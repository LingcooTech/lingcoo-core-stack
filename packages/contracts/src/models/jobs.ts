import { z } from 'zod';
import { paginationSchema } from './pagination.js';

export const JobRunSchema = z.object({
  id: z.uuid(),
  queue: z.string(),
  kind: z.string(),
  status: z.union([
    z.literal('pending'),
    z.literal('running'),
    z.literal('succeeded'),
    z.literal('failed'),
    z.literal('dead'),
  ]),
  error: z.object({ code: z.string().optional(), message: z.string().optional() }),
  attempts: z.number(),
  maxAttempts: z.number(),
  availableAt: z.iso.datetime({ offset: true }),
  startedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  finishedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  relatedEntityType: z.union([z.string(), z.null()]),
  relatedEntityId: z.union([z.string(), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type JobRun = z.infer<typeof JobRunSchema>;

export const JobRunsResponseSchema = paginationSchema(JobRunSchema);

export type JobRunsResponse = z.infer<typeof JobRunsResponseSchema>;

export const ObservabilityAlertSchema = z.object({
  id: z.string().min(1),
  level: z.union([z.literal('info'), z.literal('warning'), z.literal('error')]),
  title: z.string(),
  description: z.string(),
  count: z.number(),
  href: z.string(),
});

export type ObservabilityAlert = z.infer<typeof ObservabilityAlertSchema>;

export const ObservabilitySummarySchema = z.object({
  metrics: z.object({
    deadJobs: z.number(),
    failedJobs: z.number(),
    runningJobs: z.number(),
    pendingJobs: z.number(),
    pendingOrders: z.number(),
    stalePendingOrders: z.number(),
    unprocessedWebhooks: z.number(),
    waitingStaffTickets: z.number(),
    events24h: z.number(),
  }),
  alerts: z.array(ObservabilityAlertSchema),
});

export type ObservabilitySummary = z.infer<typeof ObservabilitySummarySchema>;

export const JobRetryResponseSchema = JobRunSchema.pick({
  id: true,
  kind: true,
  queue: true,
  status: true,
  attempts: true,
  maxAttempts: true,
});

export type JobRetryResponse = z.infer<typeof JobRetryResponseSchema>;
