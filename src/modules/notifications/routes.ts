import type { FastifyPluginAsync } from 'fastify';

import {
  adminNotificationListQuerySchema,
  notificationIdParamsSchema,
  notificationListQuerySchema,
  publishAnnouncementSchema,
} from './schemas';

export const notificationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/notifications/me', { preHandler: app.authenticate }, async (request) => {
    const query = notificationListQuerySchema.parse(request.query);
    return app.services.NotificationsService.listUserNotifications({
      userId: request.user.sub,
      ...query,
    });
  });

  app.get(
    '/v1/notifications/me/unread-count',
    { preHandler: app.authenticate },
    async (request) => {
      return app.services.NotificationsService.getUnreadCount(request.user.sub);
    },
  );

  app.post(
    '/v1/notifications/:notificationId/read',
    { preHandler: app.authenticate },
    async (request) => {
      const params = notificationIdParamsSchema.parse(request.params);
      return app.services.NotificationsService.markAsRead(params.notificationId, request.user.sub);
    },
  );

  app.post('/v1/notifications/read-all', { preHandler: app.authenticate }, async (request) => {
    return app.services.NotificationsService.markAllAsRead(request.user.sub);
  });

  app.post(
    '/v1/notifications/:notificationId/archive',
    { preHandler: app.authenticate },
    async (request) => {
      const params = notificationIdParamsSchema.parse(request.params);
      return app.services.NotificationsService.archive(params.notificationId, request.user.sub);
    },
  );

  app.get(
    '/v1/admin/notifications',
    { preHandler: app.requirePermission('notifications.manage') },
    async (request) => {
      const query = adminNotificationListQuerySchema.parse(request.query);
      return app.services.NotificationsService.listAdminNotifications(query);
    },
  );

  app.post(
    '/v1/admin/notifications/announcements',
    { preHandler: app.requirePermission('notifications.manage') },
    async (request) => {
      const payload = publishAnnouncementSchema.parse(request.body);
      const result = await app.services.NotificationsService.publishAnnouncement(
        payload,
        request.user.sub,
      );

      await app.services.EventService.capture({
        userId: request.user.sub,
        eventName: 'admin.announcement_published',
        properties: {
          broadcastId: result.broadcastId,
          recipientCount: result.recipientCount,
          title: result.title,
          level: result.level,
        },
      });

      return result;
    },
  );
};
