import { z } from 'zod';
import { UserSummarySchema, AppSummarySchema } from './summaries.js';
import { paginationSchema } from './pagination.js';

export const InstallSchema = z.object({
  id: z.uuid(),
  extensionInstallId: z.string(),
  chromeProfileHint: z.union([z.string(), z.null()]),
  appVersion: z.union([z.string(), z.null()]),
  status: z.string(),
  lastSeenAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type Install = z.infer<typeof InstallSchema>;

export const HydratedInstallSchema = z.intersection(
  InstallSchema,
  z.object({
    user: z.union([UserSummarySchema, z.null()]),
    app: z.union([AppSummarySchema, z.null()]),
  }),
);

export type HydratedInstall = z.infer<typeof HydratedInstallSchema>;

export const InstallsResponseSchema = paginationSchema(HydratedInstallSchema);

export type InstallsResponse = z.infer<typeof InstallsResponseSchema>;
