import { z } from 'zod';
export const hostingMonitorProfileSchema = z
  .object({
    projectPrefix: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/),
    services: z
      .array(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/))
      .min(1)
      .max(32)
      .refine((v) => new Set(v).size === v.length),
    backupRequired: z.boolean().default(true),
    offsiteRequired: z.boolean().default(true),
  })
  .strict();
export const hostingIncidentQuerySchema = z.object({
  state: z.enum(['active', 'resolved']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
export const HostingIncidentSchema = z.object({
  id: z.uuid(),
  scope: z.enum(['node', 'deployment', 'service']),
  resourceId: z.uuid(),
  code: z.string(),
  title: z.string(),
  severity: z.enum(['warning', 'critical']),
  state: z.enum(['active', 'resolved']),
  occurrences: z.number().int(),
  firstDetectedAt: z.string(),
  lastDetectedAt: z.string(),
  resolvedAt: z.string().nullable(),
  resolution: z.enum(['recovered', 'retired']).nullable(),
});
export const HostingIncidentsSchema = z.object({
  items: z.array(HostingIncidentSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  activeCount: z.number().int(),
  lastScanAt: z.string().nullable(),
});
export const HostingIncidentEventsSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(['opened', 'recovered', 'retired']),
      observedAt: z.string(),
    }),
  ),
});
