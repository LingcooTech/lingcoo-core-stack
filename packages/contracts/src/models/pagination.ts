import { z } from 'zod';

export const paginationSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  });

export type PaginatedResponse<T> = { items: T[]; total: number; limit: number; offset: number };

export const AdminListParamsSchema = z.object({
  limit: z.number().optional(),
  offset: z.number().optional(),
  search: z.string().optional(),
});

export type AdminListParams = z.infer<typeof AdminListParamsSchema>;
