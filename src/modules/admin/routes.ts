import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import fastifyStatic from '@fastify/static';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';

import { PaymentSettingsService } from '../../lib/payment-settings';
import { AuthRepository } from '../auth/repository';
import { AdminService } from './service';
import {
  adminCatalogProductParamsSchema,
  adminEntitlementParamsSchema,
  adminGrantEntitlementSchema,
  adminListQuerySchema,
  adminUpsertCatalogBundleSchema,
  adminOrderParamsSchema,
  alipayPaymentSettingsSchema,
  paymentProviderParamsSchema,
  wechatPaymentSettingsSchema
} from './schemas';

// Resolve admin-ui/dist relative to this module's compiled location
const adminUiDist = path.resolve(__dirname, '../../../admin-ui/dist');

// Load SPA index.html once at startup (fallback if not built)
let spaHtml: string;
try {
  spaHtml = readFileSync(path.join(adminUiDist, 'index.html'), 'utf-8');
} catch {
  spaHtml = '<!DOCTYPE html><html><body><p>Admin UI not built. Run <code>npm run build:admin</code>.</p></body></html>';
}

const SPA_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'"
].join('; ');

export const adminRoutes: FastifyPluginAsync = async (app) => {
  // Serve Vite-built assets (hashed filenames) at /assets/
  const assetsDir = path.join(adminUiDist, 'assets');
  if (existsSync(assetsDir)) {
    await app.register(fastifyStatic, {
      root: assetsDir,
      prefix: '/assets/',
      decorateReply: false
    });
  }

  // SPA handler — serves index.html for all /admin* HTML routes
  const sendSPA = async (_request: unknown, reply: FastifyReply) => {
    reply
      .type('text/html; charset=utf-8')
      .header('Content-Security-Policy', SPA_CSP);
    return reply.send(spaHtml);
  };

  app.get('/', sendSPA);
  app.get('/apps', sendSPA);
  app.get('/apps/:appCode', sendSPA);
  app.get('/login', sendSPA);
  app.get('/register', sendSPA);
  app.get('/orders', sendSPA);
  app.get('/access', sendSPA);
  app.get('/deploy', sendSPA);
  app.get('/admin', sendSPA);
  app.get('/admin/login', sendSPA);
  app.get('/admin/payments', sendSPA);
  app.get('/admin/apps', sendSPA);
  app.get('/admin/licenses', sendSPA);
  app.get('/admin/operations', sendSPA);
  app.get('/admin/observability', sendSPA);

  // ─── API Routes (unchanged) ───────────────────────────────────────────────

  app.get('/v1/admin/bootstrap-status', async () => {
    return {
      hasAdmin: (await new AuthRepository(app.db).countAdmins()) > 0
    };
  });

  app.get('/v1/admin/payment-settings', { preHandler: app.requireAdmin }, async () => {
    return new PaymentSettingsService(app.db, app.appEnv).getOverview();
  });

  app.get('/v1/admin/orders', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listOrders(query.limit);
  });

  app.post('/v1/admin/orders/:orderNo/reconcile', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminOrderParamsSchema.parse(request.params);
    return new AdminService(app.db, app.appEnv).reconcileOrder(params.orderNo);
  });

  app.get('/v1/admin/orders/:orderNo', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminOrderParamsSchema.parse(request.params);
    return new AdminService(app.db, app.appEnv).getOrderDetail(params.orderNo);
  });

  app.get('/v1/admin/installs', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listInstalls(query.limit);
  });

  app.get('/v1/admin/entitlements', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listEntitlements(query.limit);
  });

  app.put('/v1/admin/catalog/products/:productCode', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminCatalogProductParamsSchema.parse(request.params);
    const payload = adminUpsertCatalogBundleSchema.parse(request.body);
    return new AdminService(app.db, app.appEnv).upsertCatalogBundle(params.productCode, payload, request.user.sub);
  });

  app.post('/v1/admin/entitlements/grant', { preHandler: app.requireAdmin }, async (request) => {
    const payload = adminGrantEntitlementSchema.parse(request.body);
    return new AdminService(app.db, app.appEnv).grantEntitlement(payload, request.user.sub);
  });

  app.post('/v1/admin/entitlements/:entitlementId/revoke', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminEntitlementParamsSchema.parse(request.params);
    return new AdminService(app.db, app.appEnv).revokeEntitlement(params.entitlementId, request.user.sub);
  });

  app.get('/v1/admin/events', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listEvents(query.limit);
  });

  app.get('/v1/admin/billing-webhooks', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listBillingWebhookEvents(query.limit);
  });

  app.put('/v1/admin/payment-settings/wechat', { preHandler: app.requireAdmin }, async (request) => {
    const payload = wechatPaymentSettingsSchema.parse(request.body);
    return new PaymentSettingsService(app.db, app.appEnv).upsertWechatSettings(payload, request.user.sub);
  });

  app.put('/v1/admin/payment-settings/alipay', { preHandler: app.requireAdmin }, async (request) => {
    const payload = alipayPaymentSettingsSchema.parse(request.body);
    return new PaymentSettingsService(app.db, app.appEnv).upsertAlipaySettings(payload, request.user.sub);
  });

  app.delete('/v1/admin/payment-settings/:provider', { preHandler: app.requireAdmin }, async (request) => {
    const params = paymentProviderParamsSchema.parse(request.params);
    await new PaymentSettingsService(app.db, app.appEnv).clearProviderSettings(params.provider);
    return { ok: true };
  });
};
