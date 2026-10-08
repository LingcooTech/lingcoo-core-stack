import { z } from 'zod';

const fields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(5).max(2000),
  interval: z.enum(['month', 'year']),
  priceAmount: z.number().int().min(0).max(100_000_000),
  currency: z.literal('CNY'),
  graceDays: z.number().int().min(0).max(90),
  retentionDays: z.number().int().min(1).max(3650),
  status: z.enum(['draft', 'active', 'archived']),
};
const priced = (v: { status: string; priceAmount: number }) =>
  v.status !== 'active' || v.priceAmount > 0;
export const hostingOfferWriteSchema = z
  .object({
    ...fields,
    expectedVersion: z.number().int().min(0),
    reason: z.string().trim().min(5).max(500),
  })
  .strict()
  .refine(priced, { message: '上架前请填写大于零的价格', path: ['priceAmount'] });
export const hostingOfferCreateSchema = z
  .object({
    ...fields,
    id: z.uuid(),
    appId: z.uuid(),
    code: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    reason: z.string().trim().min(5).max(500),
  })
  .strict()
  .refine(priced, { message: '上架前请填写大于零的价格', path: ['priceAmount'] });
export const HostingOfferSchema = z.object({
  ...fields,
  id: z.uuid(),
  appId: z.uuid(),
  code: z.string(),
  version: z.number().int(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type HostingOffer = z.infer<typeof HostingOfferSchema>;
export type HostingOfferCreate = z.infer<typeof hostingOfferCreateSchema>;
export type HostingOfferWrite = z.infer<typeof hostingOfferWriteSchema>;
export const hostingOfferListQuerySchema = z.object({
  appId: z.uuid().optional(),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const HostingOfferListSchema = z.object({
  items: z.array(HostingOfferSchema),
  total: z.number().int(),
  apps: z.array(z.object({ id: z.uuid(), code: z.string(), name: z.string() })),
});
