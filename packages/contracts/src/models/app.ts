import { z } from 'zod';
import { PlanSummarySchema, FeatureSummarySchema, PlanFeatureSummarySchema } from './summaries.js';

export const AppScreenshotSchema = z.object({ url: z.string(), caption: z.string().optional() });

export type AppScreenshot = z.infer<typeof AppScreenshotSchema>;

export const AppHighlightSchema = z.object({
  icon: z.string().optional(),
  title: z.string(),
  description: z.string(),
});

export type AppHighlight = z.infer<typeof AppHighlightSchema>;

export const AppFaqSchema = z.object({ question: z.string(), answer: z.string() });

export type AppFaq = z.infer<typeof AppFaqSchema>;

export const AppLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
  type: z.union([
    z.literal('docs'),
    z.literal('support'),
    z.literal('website'),
    z.literal('download'),
    z.literal('other'),
  ]),
});

export type AppLink = z.infer<typeof AppLinkSchema>;

export const AppSecretSchema = z.object({
  id: z.uuid(),
  hint: z.string(),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
});

export type AppSecret = z.infer<typeof AppSecretSchema>;

export const AppSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  tagline: z.union([z.string(), z.null()]),
  description: z.union([z.string(), z.null()]),
  content: z.union([z.string(), z.null()]),
  iconUrl: z.union([z.string(), z.null()]),
  coverUrl: z.union([z.string(), z.null()]),
  screenshots: z.array(AppScreenshotSchema),
  highlights: z.array(AppHighlightSchema),
  faq: z.array(AppFaqSchema),
  links: z.array(AppLinkSchema),
  category: z.union([z.string(), z.null()]),
  sortOrder: z.number(),
  type: z.string(),
  status: z.string(),
  meta: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type App = z.infer<typeof AppSchema>;

export const AppWithDetailsSchema = z.intersection(
  AppSchema,
  z.object({
    plans: z.array(PlanSummarySchema),
    features: z.array(FeatureSummarySchema),
    checkoutOffers: z.array(
      z.object({
        code: z.string(),
        planCode: z.string(),
        planId: z.string(),
        appId: z.string(),
        appCode: z.string(),
        appName: z.string(),
        title: z.string(),
        description: z.union([z.string(), z.null()]),
        badge: z.union([z.string(), z.null()]),
        interval: z.string(),
        priceAmount: z.number(),
        currency: z.string(),
        status: z.string(),
        isDefault: z.boolean(),
        sortOrder: z.number(),
      }),
    ),
    secrets: z.array(AppSecretSchema).optional(),
  }),
);

export type AppWithDetails = z.infer<typeof AppWithDetailsSchema>;

export const AppCatalogSchema = z.object({
  app: AppWithDetailsSchema,
  plans: z.array(PlanSummarySchema),
  offers: z.array(
    z.object({
      code: z.string(),
      planCode: z.string(),
      planId: z.string(),
      appId: z.string(),
      appCode: z.string(),
      appName: z.string(),
      title: z.string(),
      description: z.union([z.string(), z.null()]),
      badge: z.union([z.string(), z.null()]),
      interval: z.string(),
      priceAmount: z.number(),
      currency: z.string(),
      status: z.string(),
      isDefault: z.boolean(),
      sortOrder: z.number(),
    }),
  ),
  features: z.array(FeatureSummarySchema),
  planFeatures: z.array(PlanFeatureSummarySchema),
});

export type AppCatalog = z.infer<typeof AppCatalogSchema>;

export const AppSecretCreatedSchema = z.object({
  appCode: z.string(),
  appName: z.string(),
  secretId: z.string(),
  secret: z.string(),
  hint: z.string(),
  expiresAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
});

export type AppSecretCreated = z.infer<typeof AppSecretCreatedSchema>;

export const UpsertAppInputSchema = z.object({
  name: z.string(),
  tagline: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  iconUrl: z.string().optional(),
  coverUrl: z.string().optional(),
  screenshots: z.array(AppScreenshotSchema).optional(),
  highlights: z.array(AppHighlightSchema).optional(),
  faq: z.array(AppFaqSchema).optional(),
  links: z.array(AppLinkSchema).optional(),
  category: z.string().optional(),
  sortOrder: z.number().optional(),
  type: z.string(),
  status: z.string(),
  features: z
    .array(z.object({ code: z.string(), name: z.string(), kind: z.string(), status: z.string() }))
    .optional(),
  plans: z
    .array(
      z.object({
        code: z.string(),
        name: z.string(),
        billingProvider: z.string(),
        billingPriceId: z.string().optional(),
        priceAmount: z.number(),
        currency: z.string(),
        interval: z.union([z.literal('month'), z.literal('year'), z.literal('one_time')]),
        status: z.string(),
        featureCodes: z.array(z.string()),
        meta: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
  offers: z
    .array(
      z.object({
        code: z.string(),
        planCode: z.string(),
        title: z.string(),
        description: z.string().optional(),
        badge: z.string().optional(),
        priceAmount: z.number(),
        currency: z.string(),
        status: z.string(),
        isDefault: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }),
    )
    .optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type UpsertAppInput = z.infer<typeof UpsertAppInputSchema>;
