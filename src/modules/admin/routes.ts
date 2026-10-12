import { staticAssetPrefix } from '../../http/static-assets';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import fastifyStatic from '@fastify/static';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { httpError } from '../../lib/errors';

import { AlertingSettingsService } from '../settings/public';
import { AuditLogService } from '../../lib/audit-logs';
import { ContentImportSettingsService } from '../settings/public';
import { DeliverySettingsService } from '../deployment/public';
import { PaymentSettingsService } from '../settings/public';
import { PublicPagesSettingsService } from '../settings/public';
import { QiniuSettingsService } from '../settings/public';
import { hasPermission, normalizeRole } from '../../lib/rbac';
import { SiteSettingsService } from '../settings/public';
import { SmtpSettingsService } from '../settings/public';
import { rotateGlobalSettingKeys } from '../settings/public';
import { createAuthAccess } from '../auth/public';

import {
  adminAppCodeParamsSchema,
  adminEntitlementParamsSchema,
  adminGrantEntitlementSchema,
  adminJobRunParamsSchema,
  adminListQuerySchema,
  adminListOrdersQuerySchema,
  adminListUsersQuerySchema,
  adminUpdateUserSchema,
  alertingSettingsSchema,
  contentImportNotionTestSchema,
  contentImportSettingsSchema,
  contentImportWordPressTestSchema,
  adminUserIdParamsSchema,
  adminUpsertDeliverySettingsSchema,
  adminOrderParamsSchema,
  alipayPaymentSettingsSchema,
  paymentProviderParamsSchema,
  qiniuListImagesQuerySchema,
  qiniuSettingsSchema,
  siteSettingsSchema,
  publicPagesSettingsSchema,
  qiniuTestConnectionSchema,
  smtpSettingsSchema,
  smtpTestEmailSchema,
  wechatPaymentSettingsSchema,
} from './schemas';

// Resolve admin-ui/dist relative to this module's compiled location
const adminUiDist = path.resolve(__dirname, '../../../admin-ui/dist');

// Load SPA index.html once at startup (fallback if not built)
let spaHtml: string;
try {
  spaHtml = readFileSync(path.join(adminUiDist, 'index.html'), 'utf-8');
} catch {
  spaHtml =
    '<!DOCTYPE html><html><body><p>Admin UI not built. Run <code>npm run build:admin</code>.</p></body></html>';
}

const SPA_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https:",
].join('; ');

export const adminRoutes: FastifyPluginAsync = async (app) => {
  const requireAppsManage = app.requirePermission('apps.manage');
  const requireOrdersView = app.requirePermission('orders.view');
  const requireOrdersReconcile = app.requirePermission('orders.reconcile');
  const requireOrdersCancel = app.requirePermission('orders.cancel');
  const requireOrdersRefund = app.requirePermission('orders.refund');
  const requirePaymentsManage = app.requirePermission('payments.manage');
  const requireSettingsManage = app.requirePermission('settings.manage');
  const requireUsersView = app.requirePermission('users.view');
  const requireUsersEdit = app.requirePermission('users.edit');
  const requireUsersSuspend = app.requirePermission('users.suspend');
  const requireUsersResetPassword = app.requirePermission('users.reset_password');
  const requireLicensesManage = app.requirePermission('licenses.manage');
  const requireInstallsView = app.requirePermission('installs.view');
  const requireObservabilityView = app.requirePermission('observability.view');

  // Serve Vite-built assets (hashed filenames) at /assets/
  const assetsDir = path.join(adminUiDist, 'assets');
  if (existsSync(assetsDir)) {
    await app.register(fastifyStatic, {
      root: assetsDir,
      prefix: staticAssetPrefix,
      immutable: true,
      maxAge: '1y',
      decorateReply: false,
    });
  }

  const developerDocsDir = path.join(adminUiDist, 'developer-docs');
  if (existsSync(developerDocsDir)) {
    await app.register(fastifyStatic, {
      root: developerDocsDir,
      prefix: '/developer-docs/',
      maxAge: 0,
      decorateReply: false,
      setHeaders: (response, filePath) => {
        response.header('Cache-Control', 'no-cache');
        response.header('X-Content-Type-Options', 'nosniff');
        if (!filePath.endsWith('.json')) {
          response.header('Content-Type', 'text/plain; charset=utf-8');
        }
      },
    });
  }

  // SPA handler — serves index.html for all /admin* HTML routes
  const sendSPA = async (_request: unknown, reply: FastifyReply) => {
    reply.type('text/html; charset=utf-8').header('Content-Security-Policy', SPA_CSP);
    return reply.send(spaHtml);
  };

  const recordAudit = async (
    request: {
      id: string;
      ip: string;
      headers: Record<string, string | string[] | undefined>;
      user: { sub: string };
    },
    input: {
      action: string;
      resourceType: string;
      resourceId?: string | null;
      summary: string;
      meta?: Record<string, unknown>;
    },
  ) => {
    await new AuditLogService(app.db).record({
      actorType: 'user',
      actorUserId: request.user.sub,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      summary: input.summary,
      ipAddress: request.ip,
      userAgent:
        typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
      requestId: request.id,
      meta: input.meta ?? {},
    });
  };

  app.get('/', sendSPA);
  app.get('/apps', sendSPA);
  app.get('/apps/ai-translate-workflow/privacy', sendSPA);
  app.get('/apps/ai-translate-workflow/support', sendSPA);
  app.get('/apps/:appCode', sendSPA);
  app.get('/content', sendSPA);
  app.get('/content/:slug', sendSPA);
  app.get('/docs', sendSPA);
  app.get('/developers', sendSPA);
  app.get('/developers/:documentId', sendSPA);
  app.get('/docs/:spaceSlug', sendSPA);
  app.get('/docs/:spaceSlug/*', sendSPA);
  app.get('/login', sendSPA);
  app.get('/register', sendSPA);
  app.get('/verify-email', sendSPA);
  app.get('/forgot-password', sendSPA);
  app.get('/account', sendSPA);
  app.get('/notifications', sendSPA);
  app.get('/orders', sendSPA);
  app.get('/access', sendSPA);
  app.get('/tickets', sendSPA);
  app.get('/tickets/new', sendSPA);
  app.get('/deploy', sendSPA);
  app.get('/admin', sendSPA);
  app.get('/admin/hosting', sendSPA);
  app.get('/admin/servers', sendSPA);
  app.get('/admin/deployments', sendSPA);
  app.get('/admin/catalog', sendSPA);
  app.get('/admin/login', sendSPA);
  app.get('/admin/settings', sendSPA);
  app.get('/admin/storage', sendSPA);
  app.get('/admin/payments', sendSPA);
  app.get('/admin/development', sendSPA);
  app.get('/admin/development/projects', sendSPA);
  app.get('/admin/development/connections', sendSPA);
  app.get('/admin/development/repositories', sendSPA);
  app.get('/admin/development/images', sendSPA);
  app.get('/admin/development/projects/new', sendSPA);
  app.get('/admin/development/projects/:appCode', sendSPA);
  app.get('/admin/development/projects/:appCode/delivery-settings', sendSPA);
  app.get('/admin/apps', sendSPA);
  app.get('/admin/apps/new', sendSPA);
  app.get('/admin/apps/import', sendSPA);
  app.get('/admin/apps/:appCode/lifecycle', sendSPA);
  app.get('/admin/apps/:appCode/edit', sendSPA);
  app.get('/admin/content', sendSPA);
  app.get('/admin/content/new', sendSPA);
  app.get('/admin/content/:contentId/edit', sendSPA);
  app.get('/admin/docs', sendSPA);
  app.get('/admin/secrets', sendSPA);
  app.get('/admin/orders', sendSPA);
  app.get('/admin/delivery', sendSPA);
  app.get('/admin/licenses', sendSPA);
  app.get('/admin/operations', sendSPA);
  app.get('/admin/observability', sendSPA);
  app.get('/admin/notifications', sendSPA);
  app.get('/admin/tickets', sendSPA);
  app.get('/admin/users', sendSPA);
  app.get('/admin/installs', sendSPA);

  // ─── API Routes (unchanged) ───────────────────────────────────────────────

  app.get('/v1/admin/bootstrap-status', async () => {
    return {
      hasAdmin: (await createAuthAccess(app.db).countAdmins()) > 0,
    };
  });

  app.get('/v1/admin/payment-settings', { preHandler: requirePaymentsManage }, async (request) => {
    return app.settings.read(request, (executor) =>
      new PaymentSettingsService(executor, app.appEnv).getOverview(),
    );
  });

  app.get(
    '/v1/admin/system-settings/smtp',
    { preHandler: requireSettingsManage },
    async (request) => {
      return app.settings.read(request, (executor) =>
        new SmtpSettingsService(executor, app.appEnv).getOverview(),
      );
    },
  );

  app.get(
    '/v1/admin/system-settings/alerting',
    { preHandler: requireSettingsManage },
    async (request) => {
      return app.settings.read(request, (executor) =>
        new AlertingSettingsService(executor, app.appEnv).getOverview(),
      );
    },
  );

  app.get(
    '/v1/admin/system-settings/qiniu',
    { preHandler: requireSettingsManage },
    async (request) => {
      return app.settings.read(request, (executor) =>
        new QiniuSettingsService(executor, app.appEnv).getOverview(),
      );
    },
  );

  app.get(
    '/v1/admin/system-settings/site',
    { preHandler: requireSettingsManage },
    async (request) => {
      return app.settings.read(request, (executor) =>
        new SiteSettingsService(executor, app.appEnv).getOverview(),
      );
    },
  );

  app.get(
    '/v1/admin/system-settings/content-import',
    { preHandler: requireSettingsManage },
    async (request) => {
      return app.settings.read(request, (executor) =>
        new ContentImportSettingsService(executor, app.appEnv).getOverview(),
      );
    },
  );

  app.get(
    '/v1/admin/delivery-settings/:appCode',
    { preHandler: requireAppsManage },
    async (request) => {
      const params = adminAppCodeParamsSchema.parse(request.params);
      return app.settings.read(request, (executor) =>
        new DeliverySettingsService(executor, app.appEnv).getOverview(params.appCode),
      );
    },
  );

  app.put(
    '/v1/admin/delivery-settings/:appCode',
    { preHandler: requireAppsManage },
    async (request) => {
      const params = adminAppCodeParamsSchema.parse(request.params);
      const payload = adminUpsertDeliverySettingsSchema.parse(request.body);
      const result = await app.settings.mutate(request, (executor) =>
        new DeliverySettingsService(executor, app.appEnv).upsertSettings(
          params.appCode,
          payload,
          request.user.sub,
        ),
      );

      return result;
    },
  );

  app.delete(
    '/v1/admin/delivery-settings/:appCode',
    { preHandler: requireAppsManage },
    async (request) => {
      const params = adminAppCodeParamsSchema.parse(request.params);
      await app.settings.mutate(request, (executor) =>
        new DeliverySettingsService(executor, app.appEnv).deleteSettings(params.appCode),
      );

      return { ok: true };
    },
  );

  app.get('/v1/admin/orders', { preHandler: requireOrdersView }, async (request) => {
    const query = adminListOrdersQuerySchema.parse(request.query);
    return app.services.AdminService.listOrders(query);
  });

  app.post(
    '/v1/admin/orders/:orderNo/reconcile',
    { preHandler: requireOrdersReconcile },
    async (request) => {
      const params = adminOrderParamsSchema.parse(request.params);
      const result = await app.services.AdminService.reconcileOrder(params.orderNo);
      await recordAudit(request, {
        action: 'admin.order.reconciled',
        resourceType: 'order',
        resourceId: params.orderNo,
        summary: `Reconciled order ${params.orderNo}`,
        meta: {
          status: result.reconciliation?.status ?? null,
        },
      });
      return result;
    },
  );

  app.post(
    '/v1/admin/orders/:orderNo/cancel',
    { preHandler: requireOrdersCancel },
    async (request) => {
      const params = adminOrderParamsSchema.parse(request.params);
      const result = await app.services.AdminService.cancelOrder(params.orderNo);
      await recordAudit(request, {
        action: 'admin.order.cancelled',
        resourceType: 'order',
        resourceId: params.orderNo,
        summary: `Cancelled order ${params.orderNo}`,
        meta: {
          status: result.action.status,
          reason: result.action.reason,
        },
      });
      return result;
    },
  );

  app.post(
    '/v1/admin/orders/:orderNo/refund',
    { preHandler: requireOrdersRefund },
    async (request) => {
      const params = adminOrderParamsSchema.parse(request.params);
      const result = await app.services.AdminService.refundOrder(params.orderNo);
      await recordAudit(request, {
        action:
          result.action.status === 'refunding'
            ? 'admin.order.refund_requested'
            : 'admin.order.refunded',
        resourceType: 'order',
        resourceId: params.orderNo,
        summary:
          result.action.status === 'refunding'
            ? `Requested refund for order ${params.orderNo}`
            : `Refunded order ${params.orderNo}`,
        meta: {
          status: result.action.status,
          reason: result.action.reason,
          refundId: result.action.refundId ?? null,
        },
      });
      return result;
    },
  );

  app.get('/v1/admin/orders/:orderNo', { preHandler: requireOrdersView }, async (request) => {
    const params = adminOrderParamsSchema.parse(request.params);
    return app.services.AdminService.getOrderDetail(params.orderNo);
  });

  app.get('/v1/admin/installs', { preHandler: requireInstallsView }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return app.services.AdminService.listInstalls(query);
  });

  app.get('/v1/admin/entitlements', { preHandler: requireLicensesManage }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return app.services.AdminService.listEntitlements(query);
  });

  app.post(
    '/v1/admin/entitlements/grant',
    { preHandler: requireLicensesManage },
    async (request) => {
      const payload = adminGrantEntitlementSchema.parse(request.body);
      const result = await app.runAdminCommand(
        request,
        {
          action: 'admin.grantEntitlement',
          resourceType: 'entitlement',
          resourceId: payload.userEmail,
          summary: 'Administrative command completed',
        },
        (services) => services.AdminService.grantEntitlement(payload, request.user.sub),
      );

      return result;
    },
  );

  app.post(
    '/v1/admin/entitlements/:entitlementId/revoke',
    { preHandler: requireLicensesManage },
    async (request) => {
      const params = adminEntitlementParamsSchema.parse(request.params);
      const result = await app.runAdminCommand(
        request,
        {
          action: 'admin.revokeEntitlement',
          resourceType: 'entitlement',
          resourceId: params.entitlementId,
          summary: 'Administrative command completed',
        },
        (services) =>
          services.AdminService.revokeEntitlement(params.entitlementId, request.user.sub),
      );

      return result;
    },
  );

  app.get('/v1/admin/events', { preHandler: requireObservabilityView }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return app.services.AdminService.listEvents(query);
  });

  app.get(
    '/v1/admin/billing-webhooks',
    { preHandler: requireObservabilityView },
    async (request) => {
      const query = adminListQuerySchema.parse(request.query);
      return app.services.AdminService.listBillingWebhookEvents(query);
    },
  );

  app.get('/v1/admin/observability/summary', { preHandler: requireObservabilityView }, async () => {
    return app.services.AdminService.getObservabilitySummary();
  });

  app.get('/v1/admin/jobs', { preHandler: requireObservabilityView }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return app.services.AdminService.listJobRuns(query);
  });

  app.post(
    '/v1/admin/jobs/:jobId/retry',
    { preHandler: app.requirePermission('jobs.manage') },
    async (request) => {
      const params = adminJobRunParamsSchema.parse(request.params);
      const result = await app.runAdminCommand(
        request,
        {
          action: 'admin.retryJobRun',
          resourceType: 'job_run',
          resourceId: params.jobId,
          summary: 'Administrative command completed',
        },
        (services) => services.AdminService.retryJobRun(params.jobId),
      );

      return result;
    },
  );

  app.get('/v1/admin/audit-logs', { preHandler: requireObservabilityView }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return app.services.AdminService.listAuditLogs(query);
  });

  app.put(
    '/v1/admin/payment-settings/wechat',
    { preHandler: requirePaymentsManage },
    async (request) => {
      const payload = wechatPaymentSettingsSchema.parse(request.body);
      const result = await app.settings.mutate(request, (executor) =>
        new PaymentSettingsService(executor, app.appEnv).upsertWechatSettings(
          payload,
          request.user.sub,
        ),
      );

      return result;
    },
  );

  app.put(
    '/v1/admin/payment-settings/alipay',
    { preHandler: requirePaymentsManage },
    async (request) => {
      const payload = alipayPaymentSettingsSchema.parse(request.body);
      const result = await app.settings.mutate(request, (executor) =>
        new PaymentSettingsService(executor, app.appEnv).upsertAlipaySettings(
          payload,
          request.user.sub,
        ),
      );

      return result;
    },
  );

  app.delete(
    '/v1/admin/payment-settings/:provider',
    { preHandler: requirePaymentsManage },
    async (request) => {
      const params = paymentProviderParamsSchema.parse(request.params);
      await app.settings.mutate(request, (executor) =>
        new PaymentSettingsService(executor, app.appEnv).clearProviderSettings(params.provider),
      );

      return { ok: true };
    },
  );

  app.put(
    '/v1/admin/system-settings/smtp',
    { preHandler: requireSettingsManage },
    async (request) => {
      const payload = smtpSettingsSchema.parse(request.body);
      const result = await app.settings.mutate(request, (executor) =>
        new SmtpSettingsService(executor, app.appEnv).upsertSettings(payload, request.user.sub),
      );

      return result;
    },
  );

  app.post(
    '/v1/admin/system-settings/rotate-secrets',
    { preHandler: app.requirePermission('settings.manage') },
    async (request) => {
      return app.db.transaction(async (tx) => {
        const result = await rotateGlobalSettingKeys(tx, app.appEnv, false);
        await new AuditLogService(tx).record({
          actorType: 'user',
          actorUserId: request.user.sub,
          action: 'settings.secrets_rotated',
          resourceType: 'system_settings',
          resourceId: 'encrypted',
          summary: 'Sensitive settings re-encrypted with active key',
          meta: { checked: result.checked, rotated: result.rotated },
        });
        return { checked: result.checked, rotated: result.rotated };
      });
    },
  );

  app.post(
    '/v1/admin/system-settings/smtp/connection-test',
    { preHandler: app.requirePermission('settings.manage') },
    (request) =>
      new SmtpSettingsService(app.db, app.appEnv).testConnection(
        smtpSettingsSchema.parse(request.body),
      ),
  );

  app.post(
    '/v1/admin/system-settings/smtp/test',
    { preHandler: requireSettingsManage },
    async (request) => {
      const payload = smtpTestEmailSchema.parse(request.body);
      return new SmtpSettingsService(app.db, app.appEnv).sendTestEmail(payload);
    },
  );

  app.delete(
    '/v1/admin/system-settings/smtp',
    { preHandler: requireSettingsManage },
    async (request) => {
      await app.settings.mutate(request, (executor) =>
        new SmtpSettingsService(executor, app.appEnv).clearSettings(),
      );

      return { ok: true };
    },
  );

  app.put(
    '/v1/admin/system-settings/alerting',
    { preHandler: requireSettingsManage },
    async (request) => {
      const payload = alertingSettingsSchema.parse(request.body);
      const result = await app.settings.mutate(request, (executor) =>
        new AlertingSettingsService(executor, app.appEnv).upsertSettings(payload, request.user.sub),
      );

      return result;
    },
  );

  app.delete(
    '/v1/admin/system-settings/alerting',
    { preHandler: requireSettingsManage },
    async (request) => {
      await app.settings.mutate(request, (executor) =>
        new AlertingSettingsService(executor, app.appEnv).clearSettings(),
      );

      return { cleared: true };
    },
  );

  app.put(
    '/v1/admin/system-settings/qiniu',
    { preHandler: requireSettingsManage },
    async (request) => {
      const payload = qiniuSettingsSchema.parse(request.body);
      const result = await app.settings.mutate(request, (executor) =>
        new QiniuSettingsService(executor, app.appEnv).upsertSettings(payload, request.user.sub),
      );

      return result;
    },
  );

  app.post(
    '/v1/admin/system-settings/qiniu/test',
    { preHandler: requireSettingsManage },
    async (request) => {
      const payload = qiniuTestConnectionSchema.parse(request.body);
      return new QiniuSettingsService(app.db, app.appEnv).testConnection(payload);
    },
  );

  app.delete(
    '/v1/admin/system-settings/qiniu',
    { preHandler: requireSettingsManage },
    async (request) => {
      await app.settings.mutate(request, (executor) =>
        new QiniuSettingsService(executor, app.appEnv).clearSettings(),
      );

      return { ok: true };
    },
  );

  app.put(
    '/v1/admin/system-settings/site',
    { preHandler: requireSettingsManage },
    async (request) => {
      const payload = siteSettingsSchema.parse(request.body);
      const result = await app.settings.mutate(request, (executor) =>
        new SiteSettingsService(executor, app.appEnv).upsertSettings(payload, request.user.sub),
      );

      return result;
    },
  );

  app.delete(
    '/v1/admin/system-settings/site',
    { preHandler: requireSettingsManage },
    async (request) => {
      await app.settings.mutate(request, (executor) =>
        new SiteSettingsService(executor, app.appEnv).clearSettings(),
      );

      return { ok: true };
    },
  );

  app.get(
    '/v1/admin/system-settings/public-pages',
    { preHandler: requireSettingsManage },
    async (request) => {
      return app.settings.read(request, (executor) =>
        new PublicPagesSettingsService(executor, app.appEnv).getOverview(),
      );
    },
  );

  app.put(
    '/v1/admin/system-settings/public-pages',
    { preHandler: requireSettingsManage },
    async (request) => {
      const payload = publicPagesSettingsSchema.parse(request.body);
      const result = await app.settings.mutate(request, (executor) =>
        new PublicPagesSettingsService(executor, app.appEnv).upsertSettings(
          payload,
          request.user.sub,
        ),
      );

      return result;
    },
  );

  app.delete(
    '/v1/admin/system-settings/public-pages',
    { preHandler: requireSettingsManage },
    async (request) => {
      await app.settings.mutate(request, (executor) =>
        new PublicPagesSettingsService(executor, app.appEnv).clearSettings(),
      );

      return { ok: true };
    },
  );

  app.put(
    '/v1/admin/system-settings/content-import',
    { preHandler: requireSettingsManage },
    async (request) => {
      const payload = contentImportSettingsSchema.parse(request.body);
      const result = await app.settings.mutate(request, (executor) =>
        new ContentImportSettingsService(executor, app.appEnv).upsertSettings(
          payload,
          request.user.sub,
        ),
      );

      return result;
    },
  );

  app.delete(
    '/v1/admin/system-settings/content-import',
    { preHandler: requireSettingsManage },
    async (request) => {
      await app.settings.mutate(request, (executor) =>
        new ContentImportSettingsService(executor, app.appEnv).clearSettings(),
      );

      return { ok: true };
    },
  );

  app.post(
    '/v1/admin/system-settings/content-import/wordpress/test',
    { preHandler: requireSettingsManage },
    async (request) => {
      const payload = contentImportWordPressTestSchema.parse(request.body);
      return new ContentImportSettingsService(app.db, app.appEnv).testWordPressConnection(payload);
    },
  );

  app.post(
    '/v1/admin/system-settings/content-import/notion/test',
    { preHandler: requireSettingsManage },
    async (request) => {
      const payload = contentImportNotionTestSchema.parse(request.body);
      return new ContentImportSettingsService(app.db, app.appEnv).testNotionConnection(payload);
    },
  );

  app.get(
    '/v1/admin/media/qiniu/images',
    { preHandler: requireSettingsManage },
    async (request) => {
      const query = qiniuListImagesQuerySchema.parse(request.query);
      return new QiniuSettingsService(app.db, app.appEnv).listImages(query);
    },
  );

  app.post(
    '/v1/admin/media/qiniu/upload-token',
    { preHandler: requireSettingsManage },
    async () => {
      throw httpError(410, '七牛专用上传已停用，请使用云存储营销素材页面');
    },
  );

  // ─── User Management ────────────────────────────────────────────────────

  app.get('/v1/admin/users', { preHandler: requireUsersView }, async (request) => {
    const query = adminListUsersQuerySchema.parse(request.query);
    return app.services.AdminService.listUsers(query);
  });

  app.get('/v1/admin/users/:userId', { preHandler: requireUsersView }, async (request) => {
    const params = adminUserIdParamsSchema.parse(request.params);
    return app.services.AdminService.getUser(params.userId);
  });

  app.put('/v1/admin/users/:userId', { preHandler: requireUsersEdit }, async (request, reply) => {
    const params = adminUserIdParamsSchema.parse(request.params);
    const payload = adminUpdateUserSchema.parse(request.body);
    const [existing, actor] = await Promise.all([
      createAuthAccess(app.db).findUserById(params.userId),
      createAuthAccess(app.db).findUserById(request.user.sub),
    ]);
    const actorRole = normalizeRole(actor?.role);

    if (!existing) {
      return reply.notFound('User not found');
    }

    if (payload.role !== undefined && !hasPermission(actorRole, 'users.role_manage')) {
      return reply.forbidden('Insufficient permission to change user roles');
    }

    if (
      payload.status !== undefined &&
      payload.status !== existing.status &&
      !hasPermission(actorRole, 'users.suspend')
    ) {
      return reply.forbidden('Insufficient permission to change user status');
    }

    const result = await app.runAdminCommand(
      request,
      {
        action: 'admin.updateUser',
        resourceType: 'user',
        resourceId: params.userId,
        summary: 'Administrative command completed',
      },
      (services) => services.AdminService.updateUser(params.userId, payload, request.user.sub),
    );

    return result;
  });

  app.post(
    '/v1/admin/users/:userId/suspend',
    { preHandler: requireUsersSuspend },
    async (request) => {
      const params = adminUserIdParamsSchema.parse(request.params);
      const result = await app.runAdminCommand(
        request,
        {
          action: 'admin.suspendUser',
          resourceType: 'user',
          resourceId: params.userId,
          summary: 'Administrative command completed',
        },
        (services) => services.AdminService.suspendUser(params.userId, request.user.sub),
      );

      return result;
    },
  );

  app.post(
    '/v1/admin/users/:userId/activate',
    { preHandler: requireUsersSuspend },
    async (request) => {
      const params = adminUserIdParamsSchema.parse(request.params);
      const result = await app.runAdminCommand(
        request,
        {
          action: 'admin.activateUser',
          resourceType: 'user',
          resourceId: params.userId,
          summary: 'Administrative command completed',
        },
        (services) => services.AdminService.activateUser(params.userId, request.user.sub),
      );

      return result;
    },
  );

  app.post(
    '/v1/admin/users/:userId/reset-password',
    { preHandler: requireUsersResetPassword },
    async (request) => {
      const params = adminUserIdParamsSchema.parse(request.params);
      const result = await app.runAdminCommand(
        request,
        {
          action: 'admin.user.password_reset',
          resourceType: 'user',
          resourceId: params.userId,
          summary: `Reset password for user ${params.userId}`,
        },
        (services) => services.AdminService.resetUserPassword(params.userId, request.user.sub),
      );

      return result;
    },
  );
};
