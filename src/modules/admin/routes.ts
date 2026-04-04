import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import fastifyStatic from '@fastify/static';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';

import { DeliverySettingsService } from '../../lib/delivery-settings';
import { PaymentSettingsService } from '../../lib/payment-settings';
import { AuthRepository } from '../auth/repository';
import { AdminService } from './service';
import {
  adminAppCodeParamsSchema,
  adminAuthorizationGrantParamsSchema,
  adminAuthorizationTemplateCodeParamsSchema,
  adminGrantAuthorizationSchema,
  adminListQuerySchema,
  adminListUsersQuerySchema,
  adminPriceCodeParamsSchema,
  adminProductCodeParamsSchema,
  adminUpdateUserSchema,
  adminUserIdParamsSchema,
  adminUpsertDeliverySettingsSchema,
  adminUpsertAuthorizationTemplateSchema,
  adminUpsertPriceSchema,
  adminUpsertProductSchema,
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
  app.get('/admin/applications', sendSPA);
  app.get('/admin/applications/new', sendSPA);
  app.get('/admin/applications/:appCode', sendSPA);
  app.get('/admin/products', sendSPA);
  app.get('/admin/products/new', sendSPA);
  app.get('/admin/products/:productCode', sendSPA);
  app.get('/admin/pricing', sendSPA);
  app.get('/admin/authorization-templates', sendSPA);
  app.get('/admin/transactions', sendSPA);
  app.get('/admin/authorizations', sendSPA);
  app.get('/admin/instances', sendSPA);
  app.get('/admin/events', sendSPA);
  app.get('/admin/logs', sendSPA);
  app.get('/admin/settings/payments', sendSPA);
  app.get('/admin/users', sendSPA);

  // ─── API Routes (unchanged) ───────────────────────────────────────────────

  app.get('/v1/admin/bootstrap-status', async () => {
    return {
      hasAdmin: (await new AuthRepository(app.db).countAdmins()) > 0
    };
  });

  app.get('/v1/admin/payment-settings', { preHandler: app.requireAdmin }, async () => {
    return new PaymentSettingsService(app.db, app.appEnv).getOverview();
  });

  app.get('/v1/admin/delivery-settings/:appCode', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminAppCodeParamsSchema.parse(request.params);
    return new DeliverySettingsService(app.db, app.appEnv).getOverview(params.appCode);
  });

  app.put('/v1/admin/delivery-settings/:appCode', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminAppCodeParamsSchema.parse(request.params);
    const payload = adminUpsertDeliverySettingsSchema.parse(request.body);
    return new DeliverySettingsService(app.db, app.appEnv).upsertSettings(params.appCode, payload, request.user.sub);
  });

  app.delete('/v1/admin/delivery-settings/:appCode', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminAppCodeParamsSchema.parse(request.params);
    await new DeliverySettingsService(app.db, app.appEnv).deleteSettings(params.appCode);
    return { ok: true };
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

  app.get('/v1/admin/authorization-grants', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listAuthorizationGrants(query.limit);
  });

  app.put('/v1/admin/products/:productCode', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminProductCodeParamsSchema.parse(request.params);
    const payload = adminUpsertProductSchema.parse(request.body);
    return new AdminService(app.db, app.appEnv).upsertProduct(params.productCode, payload, request.user.sub);
  });

  app.put('/v1/admin/prices/:priceCode', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminPriceCodeParamsSchema.parse(request.params);
    const payload = adminUpsertPriceSchema.parse(request.body);
    return new AdminService(app.db, app.appEnv).upsertPrice(params.priceCode, payload, request.user.sub);
  });

  app.put('/v1/admin/authorization-templates/:authorizationTemplateCode', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminAuthorizationTemplateCodeParamsSchema.parse(request.params);
    const payload = adminUpsertAuthorizationTemplateSchema.parse(request.body);
    return new AdminService(app.db, app.appEnv).upsertAuthorizationTemplate(
      params.authorizationTemplateCode,
      payload,
      request.user.sub
    );
  });

  app.post('/v1/admin/authorization-grants/grant', { preHandler: app.requireAdmin }, async (request) => {
    const payload = adminGrantAuthorizationSchema.parse(request.body);
    return new AdminService(app.db, app.appEnv).grantAuthorization(payload, request.user.sub);
  });

  app.post('/v1/admin/authorization-grants/:grantId/revoke', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminAuthorizationGrantParamsSchema.parse(request.params);
    return new AdminService(app.db, app.appEnv).revokeAuthorization(params.grantId, request.user.sub);
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

  // ─── User Management ────────────────────────────────────────────────────

  app.get('/v1/admin/users', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminListUsersQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listUsers(query);
  });

  app.get('/v1/admin/users/:userId', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminUserIdParamsSchema.parse(request.params);
    return new AdminService(app.db, app.appEnv).getUser(params.userId);
  });

  app.put('/v1/admin/users/:userId', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminUserIdParamsSchema.parse(request.params);
    const payload = adminUpdateUserSchema.parse(request.body);
    return new AdminService(app.db, app.appEnv).updateUser(params.userId, payload, request.user.sub);
  });

  app.patch('/v1/admin/users/:userId', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminUserIdParamsSchema.parse(request.params);
    const payload = adminUpdateUserSchema.parse(request.body);
    return new AdminService(app.db, app.appEnv).updateUser(params.userId, payload, request.user.sub);
  });

  app.post('/v1/admin/users/:userId/suspend', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminUserIdParamsSchema.parse(request.params);
    return new AdminService(app.db, app.appEnv).suspendUser(params.userId, request.user.sub);
  });

  app.post('/v1/admin/users/:userId/activate', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminUserIdParamsSchema.parse(request.params);
    return new AdminService(app.db, app.appEnv).activateUser(params.userId, request.user.sub);
  });

  app.post('/v1/admin/users/:userId/reset-password', { preHandler: app.requireAdmin }, async (request) => {
    const params = adminUserIdParamsSchema.parse(request.params);
    return new AdminService(app.db, app.appEnv).resetUserPassword(params.userId, request.user.sub);
  });
};
