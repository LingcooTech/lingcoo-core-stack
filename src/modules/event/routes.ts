import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const eventItemSchema = z.object({
  eventName: z.string().min(1).max(120),
  userId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  installId: z.string().uuid().optional(),
  eventTime: z.iso.datetime().optional(),
  properties: z.record(z.string(), z.unknown()).default({})
});

const eventBatchSchema = z.object({
  items: z.array(eventItemSchema).min(1).max(100)
});

export const eventRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/events/batch', async (request) => {
    const payload = eventBatchSchema.parse(request.body);

    request.log.info(
      {
        count: payload.items.length
      },
      'event batch accepted'
    );

    return {
      accepted: payload.items.length
    };
  });
};
