import { z } from 'zod';

const statusSchema = z.enum(['active', 'inactive', 'cancelled', 'expired']);
const intervalSchema = z.enum(['month', 'year', 'one_time']);

export const productSchema = z.object({
  schemaVersion: z.literal(1),
  app: z.object({
    code: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(120),
    tagline: z.string().trim().max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    content: z.string().trim().max(50000).optional(),
    iconUrl: z.string().trim().max(500).optional(),
    coverUrl: z.string().trim().max(500).optional(),
    screenshots: z.array(z.record(z.string(), z.unknown())).optional(),
    highlights: z.array(z.record(z.string(), z.unknown())).optional(),
    faq: z.array(z.record(z.string(), z.unknown())).optional(),
    links: z.array(z.record(z.string(), z.unknown())).optional(),
    category: z.string().trim().max(64).optional(),
    sortOrder: z.number().int().min(0).max(99999).optional(),
    type: z.string().trim().min(1).max(64).default('web_app'),
    status: statusSchema.default('active'),
    meta: z.record(z.string(), z.unknown()).optional(),
  }),
  features: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(64),
        name: z.string().trim().min(1).max(120),
        kind: z.string().trim().min(1).max(32).default('boolean'),
        status: statusSchema.default('active'),
      }),
    )
    .optional(),
  plans: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(64),
        name: z.string().trim().min(1).max(120),
        billingProvider: z.string().trim().min(1).max(32).default('self_hosted'),
        billingPriceId: z.string().trim().max(128).optional(),
        priceAmount: z.number().int().min(0).max(999999999),
        currency: z.string().trim().min(1).max(16).default('CNY'),
        interval: intervalSchema,
        status: statusSchema.default('active'),
        featureCodes: z.array(z.string().trim().min(1).max(64)).min(1).max(100),
        meta: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
  offers: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(64),
        planCode: z.string().trim().min(1).max(64),
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(500).optional(),
        badge: z.string().trim().max(64).optional(),
        priceAmount: z.number().int().min(0).max(999999999),
        currency: z.string().trim().min(1).max(16).default('CNY'),
        isDefault: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(9999).optional(),
        status: statusSchema.default('active'),
      }),
    )
    .optional(),
  delivery: z
    .object({
      manifestSource: z
        .object({
          repoUrl: z.string().trim().url(),
          repoBranch: z.string().trim().min(1).max(120).default('main'),
          manifestPath: z.string().trim().min(1).max(255).default('fd-delivery.manifest.json'),
          manifestUrl: z.string().trim().url().optional(),
        })
        .optional(),
      manifest: z.record(z.string(), z.unknown()).optional(),
      settings: z
        .object({
          values: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
          secretsFromEnv: z.record(z.string(), z.string().trim().min(1)).optional(),
          installer: z
            .object({
              repoUrl: z.string().trim().url().optional(),
              repoBranch: z.string().trim().min(1).max(120).optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export type ProductConfig = z.infer<typeof productSchema>;
