import { HostingPurchases } from './hosting-purchases';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  hostingOfferCreateSchema,
  hostingOfferWriteSchema,
  hostingOfferListQuerySchema,
} from '@lingcoo/contracts';
import { HostingOfferCatalog } from './hosting-offers';

export const hostingOfferRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/v1/billing/hosting-offers/:appCode',
    { preHandler: app.authenticate },
    async (request) => {
      const { appCode } = z.object({ appCode: z.string().min(1).max(64) }).parse(request.params);
      return new HostingOfferCatalog(app.db).forApp(appCode);
    },
  );
  app.get('/v1/billing/hosting-purchases/me', { preHandler: app.authenticate }, async (request) =>
    new HostingPurchases(app.db).list(request.user.sub),
  );
  const preHandler = app.requirePermission('hosting.offers.manage');
  app.get('/v1/admin/billing/hosting-offers', { preHandler }, async (request) =>
    new HostingOfferCatalog(app.db).list(hostingOfferListQuerySchema.parse(request.query)),
  );
  app.post('/v1/admin/billing/hosting-offers', { preHandler }, async (request, reply) => {
    const result = await new HostingOfferCatalog(app.db).create(
      request.user.sub,
      hostingOfferCreateSchema.parse(request.body),
    );
    return reply.code(201).send(result);
  });
  app.put('/v1/admin/billing/hosting-offers/:offerId', { preHandler }, async (request) => {
    const { offerId } = z.object({ offerId: z.uuid() }).parse(request.params);
    return new HostingOfferCatalog(app.db).update(
      offerId,
      request.user.sub,
      hostingOfferWriteSchema.parse(request.body),
    );
  });
};
