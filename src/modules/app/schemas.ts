import { z } from 'zod';

export const appCodeParamsSchema = z.object({
  appCode: z.string().trim().min(1).max(64)
});

export const appSecretParamsSchema = appCodeParamsSchema.extend({
  secretId: z.string().uuid()
});

const screenshotSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  caption: z.string().trim().max(200).optional()
});

const highlightSchema = z.object({
  icon: z.string().trim().max(64).optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500)
});

const faqSchema = z.object({
  question: z.string().trim().min(1).max(200),
  answer: z.string().trim().min(1).max(2000)
});

const linkSchema = z.object({
  label: z.string().trim().min(1).max(64),
  url: z.string().trim().min(1).max(2048),
  type: z.enum(['docs', 'support', 'website', 'download', 'other']).default('other')
});

export const upsertAppSchema = z.object({
  name: z.string().trim().min(1).max(120),
  tagline: z.string().trim().max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  content: z.string().trim().max(50000).optional(),
  iconUrl: z.string().trim().max(500).optional(),
  coverUrl: z.string().trim().max(500).optional(),
  screenshots: z.array(screenshotSchema).max(20).optional(),
  highlights: z.array(highlightSchema).max(8).optional(),
  faq: z.array(faqSchema).max(30).optional(),
  links: z.array(linkSchema).max(20).optional(),
  category: z.string().trim().max(64).optional(),
  sortOrder: z.number().int().min(0).max(99999).optional(),
  type: z.enum(['chrome_extension', 'web_app', 'service']).default('chrome_extension'),
  status: z.enum(['active', 'inactive', 'cancelled', 'expired']).default('active'),
  productCodes: z.array(z.string().trim().min(1).max(64)).min(1).max(50),
  checkoutOffers: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(64),
        planCode: z.string().trim().min(1).max(64),
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().max(255).optional(),
        badge: z.string().trim().max(64).optional(),
        priceAmount: z.number().int().min(0).max(999999999),
        currency: z.string().trim().min(1).max(16).default('CNY'),
        status: z.enum(['active', 'inactive', 'cancelled', 'expired']).default('active'),
        isDefault: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(9999).optional()
      })
    )
    .max(100)
    .optional(),
  checkoutDefaultOfferCode: z.string().trim().min(1).max(64).optional(),
  planConfigs: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(64),
        priceAmount: z.number().int().min(0).max(999999999),
        currency: z.string().trim().min(1).max(16).default('CNY'),
        status: z.enum(['active', 'inactive', 'cancelled', 'expired']).default('active')
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

export const createAppSessionSchema = z.object({
  appSecret: z.string().trim().min(16).max(255)
});
