import { z } from 'zod';
export const applicationImageQuerySchema = z
  .object({ connectionId: z.uuid().optional(), last: z.string().max(128).optional() })
  .strict();
export const applicationImageResolveSchema = z
  .object({ connectionId: z.uuid().optional(), reference: z.string().min(1).max(128) })
  .strict();
export const applicationImageTagsSchema = z.object({
  repository: z.string(),
  tags: z.array(z.string()),
  next: z.string().nullable(),
});
export const applicationImageManifestSchema = z.object({
  repository: z.string(),
  reference: z.string(),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  image: z.string(),
  mediaType: z.string(),
});
export const appImagesResponseContracts = [
  {
    method: 'GET',
    path: '/v1/admin/apps/:param/images/:param/tags',
    schema: applicationImageTagsSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/apps/:param/images/:param/resolve',
    schema: applicationImageManifestSchema,
  },
] as const;
