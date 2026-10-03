import { z } from 'zod';

export const UserSummarySchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.union([z.string(), z.null()]),
});

export type UserSummary = z.infer<typeof UserSummarySchema>;

export const PlanSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  interval: z.union([z.string(), z.null()]),
  priceAmount: z.number().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  appId: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type PlanSummary = z.infer<typeof PlanSummarySchema>;

export const AppSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  type: z.string(),
});

export type AppSummary = z.infer<typeof AppSummarySchema>;

export const FeatureSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  kind: z.string(),
  appId: z.string().optional(),
  status: z.string().optional(),
  createdAt: z.iso.datetime({ offset: true }).optional(),
});

export type FeatureSummary = z.infer<typeof FeatureSummarySchema>;

export const PlanFeatureSummarySchema = z.object({
  planId: z.string(),
  featureId: z.string(),
  value: z.json(),
});

export type PlanFeatureSummary = z.infer<typeof PlanFeatureSummarySchema>;

export const CatalogSnapshotSchema = z.object({
  plans: z.array(PlanSummarySchema),
  features: z.array(FeatureSummarySchema),
  planFeatures: z.array(PlanFeatureSummarySchema),
});

export type CatalogSnapshot = z.infer<typeof CatalogSnapshotSchema>;
