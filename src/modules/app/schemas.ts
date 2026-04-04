import { z } from 'zod';

export const appCodeParamsSchema = z.object({
  appCode: z.string().trim().min(1).max(64)
});

export const appSecretParamsSchema = appCodeParamsSchema.extend({
  secretId: z.string().uuid()
});

export const upsertAppSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(5000).optional(),
  type: z.enum(['chrome_extension', 'web_app', 'service']).default('chrome_extension'),
  status: z.enum(['active', 'inactive', 'cancelled', 'expired']).default('active'),
  productCodes: z.array(z.string().trim().min(1).max(64)).min(1).max(50),
  apiBaseUrl: z.string().trim().url().optional(),
  callbackUrl: z.string().trim().url().optional(),
  callbackSecret: z.string().trim().max(255).optional(),
  allowedOrigins: z.array(z.string().trim().min(1).max(2048)).max(100).optional(),
  repoUrl: z.string().trim().url().optional(),
  repoBranch: z.string().trim().min(1).max(120).optional(),
  manifestPath: z.string().trim().min(1).max(255).optional(),
  manifestUrl: z.string().trim().url().optional(),
  offers: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(64),
        priceCode: z.string().trim().min(1).max(64),
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().max(255).optional(),
        badge: z.string().trim().max(64).optional(),
        status: z.enum(['active', 'inactive', 'cancelled', 'expired']).default('active'),
        isDefault: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(9999).optional()
      })
    )
    .max(100)
    .optional(),
  meta: z.record(z.string(), z.unknown()).optional()
});

export const createAppSecretSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  expiresAt: z.string().datetime().optional()
});

export const syncDeliveryManifestSchema = z.object({
  repoUrl: z.string().trim().url().optional(),
  repoBranch: z.string().trim().min(1).max(120).optional(),
  manifestPath: z.string().trim().min(1).max(255).optional(),
  manifestUrl: z.string().trim().url().optional()
});

export const createAppSessionSchema = z.object({
  appSecret: z.string().trim().min(16).max(255)
});
