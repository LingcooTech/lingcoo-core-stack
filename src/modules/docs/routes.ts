import type { FastifyPluginAsync } from 'fastify';

import {
  adminDocSpaceListQuerySchema,
  docPageIdParamsSchema,
  docSpaceIdParamsSchema,
  publicDocPageQuerySchema,
  publicDocSpaceSlugParamsSchema,
  submitDocFeedbackSchema,
  upsertDocPageSchema,
  upsertDocSpaceSchema,
} from './schemas';

export const docsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/docs/spaces', async () => {
    return app.services.DocsService.listPublicSpaces();
  });

  app.get('/v1/docs/search-index', async () => {
    return app.services.DocsService.listSearchIndex();
  });

  app.post('/v1/docs/feedback', async (request) => {
    const payload = submitDocFeedbackSchema.parse(request.body);
    let userId: string | null = null;
    try {
      await request.jwtVerify();
      userId = request.user?.sub ?? null;
    } catch {
      // 匿名反馈允许，留空 userId
    }
    const userAgent = request.headers['user-agent'];
    return app.services.DocsService.submitFeedback({
      ...payload,
      userId,
      userAgent: typeof userAgent === 'string' ? userAgent : null,
    });
  });

  app.get('/v1/docs/spaces/:spaceSlug', async (request) => {
    const params = publicDocSpaceSlugParamsSchema.parse(request.params);
    return app.services.DocsService.getPublicSpace(params.spaceSlug);
  });

  app.get('/v1/docs/spaces/:spaceSlug/page', async (request) => {
    const params = publicDocSpaceSlugParamsSchema.parse(request.params);
    const query = publicDocPageQuerySchema.parse(request.query);
    return app.services.DocsService.getPublicPage(params.spaceSlug, query.path);
  });

  app.get(
    '/v1/admin/docs/spaces',
    { preHandler: app.requirePermission('docs.manage') },
    async (request) => {
      const query = adminDocSpaceListQuerySchema.parse(request.query);
      return app.services.DocsService.listAdminSpaces(query);
    },
  );

  app.get(
    '/v1/admin/docs/spaces/:spaceId',
    { preHandler: app.requirePermission('docs.manage') },
    async (request) => {
      const params = docSpaceIdParamsSchema.parse(request.params);
      return app.services.DocsService.getAdminSpace(params.spaceId);
    },
  );

  app.post(
    '/v1/admin/docs/spaces',
    { preHandler: app.requirePermission('docs.manage') },
    async (request, reply) => {
      const payload = upsertDocSpaceSchema.parse(request.body);
      const item = await app.services.DocsService.upsertSpace(null, payload);
      return reply.status(201).send(item);
    },
  );

  app.put(
    '/v1/admin/docs/spaces/:spaceId',
    { preHandler: app.requirePermission('docs.manage') },
    async (request) => {
      const params = docSpaceIdParamsSchema.parse(request.params);
      const payload = upsertDocSpaceSchema.parse(request.body);
      return app.services.DocsService.upsertSpace(params.spaceId, payload);
    },
  );

  app.get(
    '/v1/admin/docs/pages/:pageId',
    { preHandler: app.requirePermission('docs.manage') },
    async (request) => {
      const params = docPageIdParamsSchema.parse(request.params);
      return app.services.DocsService.getPageById(params.pageId);
    },
  );

  app.post(
    '/v1/admin/docs/pages',
    { preHandler: app.requirePermission('docs.manage') },
    async (request, reply) => {
      const payload = upsertDocPageSchema.parse(request.body);
      const item = await app.services.DocsService.upsertPage(null, payload);
      return reply.status(201).send(item);
    },
  );

  app.put(
    '/v1/admin/docs/pages/:pageId',
    { preHandler: app.requirePermission('docs.manage') },
    async (request) => {
      const params = docPageIdParamsSchema.parse(request.params);
      const payload = upsertDocPageSchema.parse(request.body);
      return app.services.DocsService.upsertPage(params.pageId, payload);
    },
  );
};
