import { z } from 'zod';
import { UserSummarySchema, AppSummarySchema } from './summaries.js';
import { paginationSchema } from './pagination.js';

export const EventSchema = z.object({
  id: z.uuid(),
  eventName: z.string(),
  eventTime: z.iso.datetime({ offset: true }),
  properties: z.unknown(),
  createdAt: z.iso.datetime({ offset: true }),
  userId: z.union([z.string(), z.null()]),
  installId: z.union([z.string(), z.null()]),
  appId: z.union([z.string(), z.null()]),
});

export type Event = z.infer<typeof EventSchema>;

export const HydratedEventSchema = z.intersection(
  EventSchema,
  z.object({
    user: z.union([UserSummarySchema, z.null()]),
    install: z.union([
      z.object({ id: z.string(), extensionInstallId: z.string(), status: z.string() }),
      z.null(),
    ]),
    app: z.union([AppSummarySchema, z.null()]),
  }),
);

export type HydratedEvent = z.infer<typeof HydratedEventSchema>;

export const EventsResponseSchema = paginationSchema(HydratedEventSchema);

export type EventsResponse = z.infer<typeof EventsResponseSchema>;
