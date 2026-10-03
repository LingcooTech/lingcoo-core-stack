import { z } from 'zod';
import { paginationSchema, AdminListParamsSchema } from './pagination.js';
import { UserSummarySchema } from './summaries.js';

export const NotificationItemSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  category: z.union([
    z.literal('account'),
    z.literal('billing'),
    z.literal('license'),
    z.literal('deployment'),
    z.literal('ticket'),
    z.literal('system'),
    z.literal('announcement'),
  ]),
  level: z.union([
    z.literal('info'),
    z.literal('success'),
    z.literal('warning'),
    z.literal('error'),
  ]),
  title: z.string(),
  body: z.string(),
  ctaLabel: z.union([z.string(), z.null()]),
  ctaUrl: z.union([z.string(), z.null()]),
  status: z.union([z.literal('unread'), z.literal('read'), z.literal('archived')]),
  sourceEventId: z.union([z.string(), z.null()]),
  sourceEventName: z.union([z.string(), z.null()]),
  dedupeKey: z.union([z.string(), z.null()]),
  meta: z.record(z.string(), z.unknown()),
  readAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  archivedAt: z.union([z.iso.datetime({ offset: true }), z.null()]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type NotificationItem = z.infer<typeof NotificationItemSchema>;

export const NotificationsResponseSchema = paginationSchema(NotificationItemSchema);

export type NotificationsResponse = z.infer<typeof NotificationsResponseSchema>;

export const NotificationUnreadCountSchema = z.object({ unreadCount: z.number() });

export type NotificationUnreadCount = z.infer<typeof NotificationUnreadCountSchema>;

export const AdminNotificationItemSchema = z.intersection(
  NotificationItemSchema,
  z.object({
    user: z.union([
      z.intersection(UserSummarySchema, z.object({ status: z.union([z.string(), z.null()]) })),
      z.null(),
    ]),
  }),
);

export type AdminNotificationItem = z.infer<typeof AdminNotificationItemSchema>;

export const AdminNotificationsResponseSchema = paginationSchema(AdminNotificationItemSchema);

export type AdminNotificationsResponse = z.infer<typeof AdminNotificationsResponseSchema>;

export const PublishAnnouncementResultSchema = z.object({
  broadcastId: z.string(),
  recipientCount: z.number(),
  title: z.string(),
  level: z.union([
    z.literal('info'),
    z.literal('success'),
    z.literal('warning'),
    z.literal('error'),
  ]),
  createdAt: z.iso.datetime({ offset: true }),
});

export type PublishAnnouncementResult = z.infer<typeof PublishAnnouncementResultSchema>;

export const AdminNotificationListParamsSchema = z.intersection(
  AdminListParamsSchema,
  z.object({
    status: z.union([z.literal('unread'), z.literal('read'), z.literal('archived')]).optional(),
    category: z
      .union([
        z.literal('account'),
        z.literal('billing'),
        z.literal('license'),
        z.literal('deployment'),
        z.literal('ticket'),
        z.literal('system'),
        z.literal('announcement'),
      ])
      .optional(),
  }),
);

export type AdminNotificationListParams = z.infer<typeof AdminNotificationListParamsSchema>;
