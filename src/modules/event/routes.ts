import type { FastifyPluginAsync } from 'fastify';

import { eventBatchSchema } from './schemas';

export const eventRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/events/batch', async (request) => {
    const payload = eventBatchSchema.parse(request.body);
    const service = app.services.EventService;

    await service.captureMany(
      payload.items.map((item) => ({
        ...item,
        eventTime: item.eventTime ? new Date(item.eventTime) : undefined,
      })),
    );

    request.log.info(
      {
        count: payload.items.length,
      },
      'event batch accepted',
    );

    return {
      accepted: payload.items.length,
    };
  });
};
