import type { FastifyPluginAsync } from 'fastify';

import {
  adminDocSpaceListQuerySchema,
  docPageIdParamsSchema,
  docSpaceIdParamsSchema,
  publicDocPageQuerySchema,
  publicDocSpaceSlugParamsSchema,
  upsertDocPageSchema,
  upsertDocSpaceSchema,
} from './schemas';
import { DocsService } from './service';

export const docsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/docs/spaces', async () => {
    return new DocsService(app.db).listPublicSpaces();
  });

  app.get('/v1/docs/search-index', async () => {
    return new DocsService(app.db).listSearchIndex();
  });

  app.get('/v1/docs/spaces/:spaceSlug', async (request) => {
    const params = publicDocSpaceSlugParamsSchema.parse(request.params);
    return new DocsService(app.db).getPublicSpace(params.spaceSlug);
  });

  app.get('/v1/docs/spaces/:spaceSlug/page', async (request) => {
    const params = publicDocSpaceSlugParamsSchema.parse(request.params);
    const query = publicDocPageQuerySchema.parse(request.query);
    return new DocsService(app.db).getPublicPage(params.spaceSlug, query.path);
  });

  app.get('/v1/admin/docs/spaces', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminDocSpaceListQuerySchema.parse(request.query);
    return new DocsService(app.db).listAdminSpaces(query);
  });

  app.get('/v1/admin/docs/spaces/:spaceId', { preHandler: app.requireAdmin }, async (request) => {
    const params = docSpaceIdParamsSchema.parse(request.params);
    return new DocsService(app.db).getAdminSpace(params.spaceId);
  });

  app.post('/v1/admin/docs/spaces', { preHandler: app.requireAdmin }, async (request, reply) => {
    const payload = upsertDocSpaceSchema.parse(request.body);
    const item = await new DocsService(app.db).upsertSpace(null, payload);
    return reply.status(201).send(item);
  });

  app.put('/v1/admin/docs/spaces/:spaceId', { preHandler: app.requireAdmin }, async (request) => {
    const params = docSpaceIdParamsSchema.parse(request.params);
    const payload = upsertDocSpaceSchema.parse(request.body);
    return new DocsService(app.db).upsertSpace(params.spaceId, payload);
  });

  app.get('/v1/admin/docs/pages/:pageId', { preHandler: app.requireAdmin }, async (request) => {
    const params = docPageIdParamsSchema.parse(request.params);
    return new DocsService(app.db).getPageById(params.pageId);
  });

  app.post('/v1/admin/docs/pages', { preHandler: app.requireAdmin }, async (request, reply) => {
    const payload = upsertDocPageSchema.parse(request.body);
    const item = await new DocsService(app.db).upsertPage(null, payload);
    return reply.status(201).send(item);
  });

  app.put('/v1/admin/docs/pages/:pageId', { preHandler: app.requireAdmin }, async (request) => {
    const params = docPageIdParamsSchema.parse(request.params);
    const payload = upsertDocPageSchema.parse(request.body);
    return new DocsService(app.db).upsertPage(params.pageId, payload);
  });
};
