import type { FastifyPluginAsync } from 'fastify';
import type { Readable } from 'node:stream';
import { z } from 'zod';
import {
  assetQuerySchema,
  assetUploadSchema,
  assetUpdateSchema,
  assetRevisionSchema,
  storageSettingsSchema,
} from '@lingcoo/contracts';
import { StorageSettingsService } from '../settings/public';
import { StorageService } from './service';
import { httpError } from '../../lib/errors';
const idSchema = z.object({ id: z.uuid() });
const folderSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const storageRoutes: FastifyPluginAsync = async (app) => {
  const read = app.requirePermission('storage.read'),
    manage = app.requirePermission('storage.manage');
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: 25 * 1024 * 1024 },
    (_request, body, done) => done(null, body),
  );
  app.get(
    '/v1/admin/system-settings/storage',
    { preHandler: app.requirePermission('settings.manage') },
    (request) =>
      app.settings.read(request, (tx) => new StorageSettingsService(tx, app.appEnv).overview()),
  );
  app.put(
    '/v1/admin/system-settings/storage',
    { preHandler: app.requirePermission('settings.manage') },
    (request) =>
      app.settings.mutate(request, (tx) =>
        new StorageService(tx, app.appEnv).saveSettings(
          storageSettingsSchema.parse(request.body),
          request.user.sub,
        ),
      ),
  );
  app.post(
    '/v1/admin/system-settings/storage/test',
    { preHandler: app.requirePermission('settings.manage') },
    (request) =>
      app.services.StorageService.testSettings(storageSettingsSchema.parse(request.body)),
  );
  app.get('/v1/admin/storage/folders', { preHandler: read }, () =>
    app.services.StorageService.folders(),
  );
  app.post('/v1/admin/storage/folders', { preHandler: manage }, (request) =>
    app.services.StorageService.saveFolder(null, folderSchema.parse(request.body).name),
  );
  app.patch('/v1/admin/storage/folders/:id', { preHandler: manage }, (request) =>
    app.services.StorageService.saveFolder(
      idSchema.parse(request.params).id,
      folderSchema.parse(request.body).name,
    ),
  );
  app.delete('/v1/admin/storage/folders/:id', { preHandler: manage }, (request) =>
    app.services.StorageService.deleteFolder(idSchema.parse(request.params).id),
  );
  app.get('/v1/admin/storage/assets', { preHandler: read }, (request) =>
    app.services.StorageService.list(assetQuerySchema.parse(request.query)),
  );
  app.get('/v1/admin/storage/assets/:id', { preHandler: read }, (request) =>
    app.services.StorageService.detail(idSchema.parse(request.params).id),
  );
  app.post('/v1/admin/storage/uploads', { preHandler: manage }, (request) =>
    app.services.StorageService.authorize(assetUploadSchema.parse(request.body), request.user.sub),
  );
  app.post('/v1/admin/storage/assets/:id/replacements', { preHandler: manage }, (request) =>
    app.services.StorageService.authorize(assetUploadSchema.parse(request.body), request.user.sub, {
      id: idSchema.parse(request.params).id,
      expectedRevision: assetRevisionSchema.parse(request.body).expectedRevision,
    }),
  );
  app.put(
    '/v1/admin/storage/uploads/:id/content',
    { preHandler: manage, bodyLimit: 25 * 1024 * 1024 },
    (request) => {
      if (!Buffer.isBuffer(request.body)) throw httpError(415, '请使用二进制文件上传');
      return app.services.StorageService.upload(
        idSchema.parse(request.params).id,
        request.body,
        request.user.sub,
      );
    },
  );
  app.patch('/v1/admin/storage/assets/:id', { preHandler: manage }, (request) =>
    app.services.StorageService.update(
      idSchema.parse(request.params).id,
      assetUpdateSchema.parse(request.body),
      request.user.sub,
    ),
  );
  app.delete('/v1/admin/storage/assets/:id', { preHandler: manage }, (request) =>
    app.services.StorageService.delete(
      idSchema.parse(request.params).id,
      assetRevisionSchema.parse(request.body).expectedRevision,
      request.user.sub,
    ),
  );
  for (const isPublic of [false, true])
    app.get(
      isPublic ? '/v1/assets/:id/content' : '/v1/admin/storage/assets/:id/content',
      { preHandler: isPublic ? undefined : read },
      async (request, reply) => {
        const {
          object,
          config,
          read: get,
        } = await app.services.StorageService.content(idSchema.parse(request.params).id, isPublic);
        reply
          .header('x-content-type-options', 'nosniff')
          .header(
            'cache-control',
            isPublic ? 'public, max-age=60, must-revalidate' : 'private, no-store',
          );
        if (isPublic && config.publicBaseUrl)
          return reply.redirect(
            `${config.publicBaseUrl.replace(/\/+$/, '')}/${object.objectKey.split('/').map(encodeURIComponent).join('/')}`,
          );
        const etag = `"${object.checksumSha256}"`;
        reply.header('etag', etag);
        if (isPublic && request.headers['if-none-match'] === etag) return reply.code(304).send();
        const result = await get();
        if (!result.Body) throw httpError(502, '存储服务未返回文件内容');
        return reply
          .type(object.contentType)
          .header('content-length', object.sizeBytes)
          .header(
            'content-disposition',
            `${object.contentType.startsWith('image/') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(object.originalName)}`,
          )
          .send(result.Body as Readable);
      },
    );
};
