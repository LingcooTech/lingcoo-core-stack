import type { FastifyPluginAsync } from 'fastify';

import { notificationIdParamsSchema, notificationListQuerySchema } from './schemas';
import { NotificationsService } from './service';

export const notificationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/notifications/me', { preHandler: app.authenticate }, async (request) => {
    const query = notificationListQuerySchema.parse(request.query);
    return new NotificationsService(app.db).listUserNotifications({
      userId: request.user.sub,
      ...query,
    });
  });

  app.get('/v1/notifications/me/unread-count', { preHandler: app.authenticate }, async (request) => {
    return new NotificationsService(app.db).getUnreadCount(request.user.sub);
  });

  app.post('/v1/notifications/:notificationId/read', { preHandler: app.authenticate }, async (request) => {
    const params = notificationIdParamsSchema.parse(request.params);
    return new NotificationsService(app.db).markAsRead(params.notificationId, request.user.sub);
  });

  app.post('/v1/notifications/read-all', { preHandler: app.authenticate }, async (request) => {
    return new NotificationsService(app.db).markAllAsRead(request.user.sub);
  });

  app.post('/v1/notifications/:notificationId/archive', { preHandler: app.authenticate }, async (request) => {
    const params = notificationIdParamsSchema.parse(request.params);
    return new NotificationsService(app.db).archive(params.notificationId, request.user.sub);
  });
};
