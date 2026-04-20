import { z } from 'zod';

const notificationCategorySchema = z.enum(['account', 'billing', 'license', 'deployment', 'ticket', 'system', 'announcement']);
const optionalCtaUrlSchema = z
  .union([z.string().trim().max(500), z.literal('')])
  .optional()
  .refine((value) => {
    if (!value) {
      return true;
    }

    if (value.startsWith('/')) {
      return true;
    }

    try {
      const url = new URL(value);
      return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol);
    } catch {
      return false;
    }
  }, '请输入有效链接，支持 /path、http(s)、mailto 或 tel')
  .transform((value) => (value ? value : undefined));

export const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['unread', 'read', 'archived']).optional(),
  category: notificationCategorySchema.optional(),
});

export const notificationIdParamsSchema = z.object({
  notificationId: z.string().uuid(),
});

export const adminNotificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().max(255).optional(),
  status: z.enum(['unread', 'read', 'archived']).optional(),
  category: notificationCategorySchema.optional(),
});

export const publishAnnouncementSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(5000),
    level: z.enum(['info', 'success', 'warning', 'error']).default('info'),
    ctaLabel: z
      .union([z.string().trim().max(80), z.literal('')])
      .optional()
      .transform((value) => (value ? value : undefined)),
    ctaUrl: optionalCtaUrlSchema,
  })
  .refine((value) => (value.ctaLabel && value.ctaUrl) || (!value.ctaLabel && !value.ctaUrl), {
    message: '操作文案和操作链接需要同时填写',
    path: ['ctaLabel'],
  });
