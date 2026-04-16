import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import fastifyStatic from '@fastify/static';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';

import { DeliverySettingsService } from '../../lib/delivery-settings';
import { PaymentSettingsService } from '../../lib/payment-settings';
import { QiniuSettingsService } from '../../lib/qiniu-settings';
import { SmtpSettingsService } from '../../lib/smtp-settings';
import { AuthRepository } from '../auth/repository';
import { AdminService } from './service';
import {
  adminAppCodeParamsSchema,
  adminEntitlementParamsSchema,
  adminGrantEntitlementSchema,
  adminListQuerySchema,
  adminListOrdersQuerySchema,
  adminListUsersQuerySchema,
  adminUpdateUserSchema,
  adminUserIdParamsSchema,
  adminUpsertDeliverySettingsSchema,
  adminOrderParamsSchema,
  alipayPaymentSettingsSchema,
  paymentProviderParamsSchema,
  qiniuListImagesQuerySchema,
  qiniuSettingsSchema,
  qiniuTestConnectionSchema,
  qiniuUploadTokenSchema,
  smtpSettingsSchema,
  smtpTestEmailSchema,
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
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https:"
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
  app.get('/apps/ai-translate-workflow/privacy', sendSPA);
  app.get('/apps/ai-translate-workflow/support', sendSPA);
  app.get('/apps/:appCode', sendSPA);
  app.get('/login', sendSPA);
  app.get('/register', sendSPA);
  app.get('/verify-email', sendSPA);
  app.get('/forgot-password', sendSPA);
  app.get('/orders', sendSPA);
  app.get('/access', sendSPA);
  app.get('/deploy', sendSPA);
  app.get('/admin', sendSPA);
  app.get('/admin/login', sendSPA);
  app.get('/admin/settings', sendSPA);
  app.get('/admin/payments', sendSPA);
  app.get('/admin/apps', sendSPA);
  app.get('/admin/apps/new', sendSPA);
  app.get('/admin/apps/:appCode/edit', sendSPA);
  app.get('/admin/secrets', sendSPA);
  app.get('/admin/orders', sendSPA);
  app.get('/admin/delivery', sendSPA);
  app.get('/admin/licenses', sendSPA);
  app.get('/admin/operations', sendSPA);
  app.get('/admin/observability', sendSPA);
  app.get('/admin/users', sendSPA);
  app.get('/admin/installs', sendSPA);

  // ─── API Routes (unchanged) ───────────────────────────────────────────────

  app.get('/v1/admin/bootstrap-status', async () => {
    return {
      hasAdmin: (await new AuthRepository(app.db).countAdmins()) > 0
    };
  });

  app.get('/v1/admin/payment-settings', { preHandler: app.requireAdmin }, async () => {
    return new PaymentSettingsService(app.db, app.appEnv).getOverview();
  });

  app.get('/v1/admin/system-settings/smtp', { preHandler: app.requireAdmin }, async () => {
    return new SmtpSettingsService(app.db, app.appEnv).getOverview();
  });

  app.get('/v1/admin/system-settings/qiniu', { preHandler: app.requireAdmin }, async () => {
    return new QiniuSettingsService(app.db, app.appEnv).getOverview();
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
    const query = adminListOrdersQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listOrders(query);
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
    return new AdminService(app.db, app.appEnv).listInstalls(query);
  });

  app.get('/v1/admin/entitlements', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listEntitlements(query);
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
    return new AdminService(app.db, app.appEnv).listEvents(query);
  });

  app.get('/v1/admin/billing-webhooks', { preHandler: app.requireAdmin }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listBillingWebhookEvents(query);
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

  app.put('/v1/admin/system-settings/smtp', { preHandler: app.requireAdmin }, async (request) => {
    const payload = smtpSettingsSchema.parse(request.body);
    return new SmtpSettingsService(app.db, app.appEnv).upsertSettings(payload, request.user.sub);
  });

  app.post('/v1/admin/system-settings/smtp/test', { preHandler: app.requireAdmin }, async (request) => {
    const payload = smtpTestEmailSchema.parse(request.body);
    return new SmtpSettingsService(app.db, app.appEnv).sendTestEmail(payload);
  });

  app.delete('/v1/admin/system-settings/smtp', { preHandler: app.requireAdmin }, async () => {
    await new SmtpSettingsService(app.db, app.appEnv).clearSettings();
    return { ok: true };
  });

  app.put('/v1/admin/system-settings/qiniu', { preHandler: app.requireAdmin }, async (request) => {
    const payload = qiniuSettingsSchema.parse(request.body);
    return new QiniuSettingsService(app.db, app.appEnv).upsertSettings(payload, request.user.sub);
  });

  app.post('/v1/admin/system-settings/qiniu/test', { preHandler: app.requireAdmin }, async (request) => {
    const payload = qiniuTestConnectionSchema.parse(request.body);
    return new QiniuSettingsService(app.db, app.appEnv).testConnection(payload);
  });

  app.delete('/v1/admin/system-settings/qiniu', { preHandler: app.requireAdmin }, async () => {
    await new QiniuSettingsService(app.db, app.appEnv).clearSettings();
    return { ok: true };
  });

  app.get('/v1/admin/media/qiniu/images', { preHandler: app.requireAdmin }, async (request) => {
    const query = qiniuListImagesQuerySchema.parse(request.query);
    return new QiniuSettingsService(app.db, app.appEnv).listImages(query);
  });

  app.post('/v1/admin/media/qiniu/upload-token', { preHandler: app.requireAdmin }, async (request) => {
    const payload = qiniuUploadTokenSchema.parse(request.body);
    return new QiniuSettingsService(app.db, app.appEnv).createUploadToken(payload);
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
