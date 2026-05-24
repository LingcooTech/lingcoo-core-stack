import type { FastifyPluginAsync } from 'fastify';

import { EventService } from '../event/service';
import {
  adminNotificationListQuerySchema,
  notificationIdParamsSchema,
  notificationListQuerySchema,
  publishAnnouncementSchema,
} from './schemas';
import { NotificationsService } from './service';

export const notificationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/notifications/me', { preHandler: app.authenticate }, async (request) => {
    const query = notificationListQuerySchema.parse(request.query);
    return new NotificationsService(app.db).listUserNotifications({
      userId: request.user.sub,
      ...query,
    });
  });

  app.get(
    '/v1/notifications/me/unread-count',
    { preHandler: app.authenticate },
    async (request) => {
      return new NotificationsService(app.db).getUnreadCount(request.user.sub);
    },
  );

  app.post(
    '/v1/notifications/:notificationId/read',
    { preHandler: app.authenticate },
    async (request) => {
      const params = notificationIdParamsSchema.parse(request.params);
      return new NotificationsService(app.db).markAsRead(params.notificationId, request.user.sub);
    },
  );

  app.post('/v1/notifications/read-all', { preHandler: app.authenticate }, async (request) => {
    return new NotificationsService(app.db).markAllAsRead(request.user.sub);
  });

  app.post(
    '/v1/notifications/:notificationId/archive',
    { preHandler: app.authenticate },
    async (request) => {
      const params = notificationIdParamsSchema.parse(request.params);
      return new NotificationsService(app.db).archive(params.notificationId, request.user.sub);
    },
  );

  app.get(
    '/v1/admin/notifications',
    { preHandler: app.requirePermission('notifications.manage') },
    async (request) => {
      const query = adminNotificationListQuerySchema.parse(request.query);
      return new NotificationsService(app.db).listAdminNotifications(query);
    },
  );

  app.post(
    '/v1/admin/notifications/announcements',
    { preHandler: app.requirePermission('notifications.manage') },
    async (request) => {
      const payload = publishAnnouncementSchema.parse(request.body);
      const result = await new NotificationsService(app.db).publishAnnouncement(
        payload,
        request.user.sub,
      );

      await new EventService(app.db).capture({
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
