import type { FastifyPluginAsync } from 'fastify';

import { ContentImportSettingsService } from '../../lib/content-import-settings';
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

  app.get(
    '/v1/admin/content',
    { preHandler: app.requirePermission('content.manage') },
    async (request) => {
      const query = contentListQuerySchema.parse(request.query);
      return new ContentService(app.db).listContent(query);
    },
  );

  app.get(
    '/v1/admin/content/:contentId',
    { preHandler: app.requirePermission('content.manage') },
    async (request) => {
      const params = contentIdParamsSchema.parse(request.params);
      return new ContentService(app.db).getContentById(params.contentId);
    },
  );

  app.post(
    '/v1/admin/content',
    { preHandler: app.requirePermission('content.manage') },
    async (request, reply) => {
      const payload = upsertContentSchema.parse(request.body);
      const item = await new ContentService(app.db).upsertContent(null, payload, request.user.sub);
      return reply.status(201).send(item);
    },
  );

  app.put(
    '/v1/admin/content/:contentId',
    { preHandler: app.requirePermission('content.manage') },
    async (request) => {
      const params = contentIdParamsSchema.parse(request.params);
      const payload = upsertContentSchema.parse(request.body);
      return new ContentService(app.db).upsertContent(params.contentId, payload, request.user.sub);
    },
  );

  app.post(
    '/v1/admin/content/import/wordpress',
    { preHandler: app.requirePermission('content.manage') },
    async (request, reply) => {
      const payload = importWordPressContentSchema.parse(request.body);
      const settings = await new ContentImportSettingsService(
        app.db,
        app.appEnv,
      ).getRuntimeSettings();
      const item = await new ContentService(app.db).importFromWordPress(
        {
          siteUrl: settings?.wordpress.siteUrl || '',
          postUrl: payload.postUrl,
          username: settings?.wordpress.username,
          appPassword: settings?.wordpress.appPassword,
          status: payload.status,
        },
        request.user.sub,
      );
      return reply.status(201).send(item);
    },
  );

  app.post(
    '/v1/admin/content/import/notion',
    { preHandler: app.requirePermission('content.manage') },
    async (request, reply) => {
      const payload = importNotionContentSchema.parse(request.body);
      const settings = await new ContentImportSettingsService(
        app.db,
        app.appEnv,
      ).getRuntimeSettings();
      const item = await new ContentService(app.db).importFromNotion(
        {
          apiToken: settings?.notion.apiToken || '',
          pageUrl: payload.pageUrl,
          status: payload.status,
        },
        request.user.sub,
      );
      return reply.status(201).send(item);
    },
  );

  app.post(
    '/v1/admin/content/import/wechat',
    { preHandler: app.requirePermission('content.manage') },
    async (request, reply) => {
      const payload = importWechatContentSchema.parse(request.body);
      const item = await new ContentService(app.db).importFromWechat(payload, request.user.sub);
      return reply.status(201).send(item);
    },
  );
};
