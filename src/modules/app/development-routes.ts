import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  applicationPreviewSchema,
  applicationReleaseInputSchema,
  developmentInventoryQuerySchema,
} from '@lingcoo/contracts';
import { DevelopmentInventory } from './development-inventory';
export async function registerDevelopmentRoutes(app: FastifyInstance) {
  const managed = { preHandler: app.requirePermission('apps.manage') };
  const code = (params: unknown) =>
    z.object({ projectCode: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/) }).parse(params).projectCode;
  app.get('/v1/admin/development/projects', managed, () =>
    app.services.AppService.lifecycle().projects(),
  );
  app.post('/v1/admin/development/projects', managed, (r) =>
    app.services.AppService.lifecycle().createProject(
      applicationPreviewSchema.parse(r.body),
      r.user.sub,
    ),
  );
  app.get('/v1/admin/development/projects/:projectCode', managed, (r) =>
    app.services.AppService.lifecycle().overview(code(r.params)),
  );
  app.post('/v1/admin/development/projects/:projectCode/product', managed, (r) =>
    app.services.AppService.lifecycle().importProjectProduct(code(r.params), r.user.sub),
  );
  app.post('/v1/admin/development/projects/:projectCode/releases', managed, (r) =>
    app.services.AppService.lifecycle().registerRelease(
      code(r.params),
      applicationReleaseInputSchema.parse(r.body),
      r.user.sub,
    ),
  );
  app.get('/v1/admin/development/connections/:connectionId/inventory', managed, (r) =>
    new DevelopmentInventory(app.db, app.appEnv).list(
      z.object({ connectionId: z.uuid() }).parse(r.params).connectionId,
      developmentInventoryQuerySchema.parse(r.query),
    ),
  );
  app.post('/v1/admin/apps/:appCode/delivery-version', managed, (r) =>
    app.services.AppService.selectDeliveryVersion(
      z.object({ appCode: z.string() }).parse(r.params).appCode,
      z.object({ releaseId: z.uuid() }).parse(r.body).releaseId,
      r.user.sub,
    ),
  );
}
