import type { FastifyPluginAsync } from 'fastify';

import {
  contentListQuerySchema,
  contentIdParamsSchema,
  importNotionContentSchema,
  importWechatContentSchema,
  importWordPressContentSchema,
  publicContentSlugParamsSchema,
  upsertContentSchema,
} from './schemas';
import { ContentService } from './service';

export const contentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/content', async (request) => {
    const query = contentListQuerySchema.parse(request.query);
    return new ContentService(app.db).listPublishedContent(query);
  });

  app.get('/v1/content/:slug', async (request) => {
    const params = publicContentSlugParamsSchema.parse(request.params);
    return new ContentService(app.db).getPublicContentBySlug(params.slug);
  });

  app.get('/v1/admin/content', { preHandler: app.requireAdmin }, async (request) => {
    const query = contentListQuerySchema.parse(request.query);
    return new ContentService(app.db).listContent(query);
  });

  app.get('/v1/admin/content/:contentId', { preHandler: app.requireAdmin }, async (request) => {
    const params = contentIdParamsSchema.parse(request.params);
    return new ContentService(app.db).getContentById(params.contentId);
  });

  app.post('/v1/admin/content', { preHandler: app.requireAdmin }, async (request, reply) => {
    const payload = upsertContentSchema.parse(request.body);
    const item = await new ContentService(app.db).upsertContent(null, payload, request.user.sub);
    return reply.status(201).send(item);
  });

  app.put('/v1/admin/content/:contentId', { preHandler: app.requireAdmin }, async (request) => {
    const params = contentIdParamsSchema.parse(request.params);
    const payload = upsertContentSchema.parse(request.body);
    return new ContentService(app.db).upsertContent(params.contentId, payload, request.user.sub);
  });

  app.post('/v1/admin/content/import/wordpress', { preHandler: app.requireAdmin }, async (request, reply) => {
    const payload = importWordPressContentSchema.parse(request.body);
    const item = await new ContentService(app.db).importFromWordPress(payload, request.user.sub);
    return reply.status(201).send(item);
  });

  app.post('/v1/admin/content/import/notion', { preHandler: app.requireAdmin }, async (request, reply) => {
    const payload = importNotionContentSchema.parse(request.body);
    const item = await new ContentService(app.db).importFromNotion(payload, request.user.sub);
    return reply.status(201).send(item);
  });

  app.post('/v1/admin/content/import/wechat', { preHandler: app.requireAdmin }, async (request, reply) => {
    const payload = importWechatContentSchema.parse(request.body);
    const item = await new ContentService(app.db).importFromWechat(payload, request.user.sub);
    return reply.status(201).send(item);
  });
};
