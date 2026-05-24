import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import fastifyStatic from '@fastify/static';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';

import { AlertingSettingsService } from '../../lib/alerting-settings';
import { AuditLogService } from '../../lib/audit-logs';
import { ContentImportSettingsService } from '../../lib/content-import-settings';
import { DeliverySettingsService } from '../../lib/delivery-settings';
import { PaymentSettingsService } from '../../lib/payment-settings';
import { PublicPagesSettingsService } from '../../lib/public-pages-settings';
import { QiniuSettingsService } from '../../lib/qiniu-settings';
import { hasPermission, normalizeRole } from '../../lib/rbac';
import { SiteSettingsService } from '../../lib/site-settings';
import { SmtpSettingsService } from '../../lib/smtp-settings';
import { AuthRepository } from '../auth/repository';
import { AdminService } from './service';
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
  qiniuUploadTokenSchema,
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
      prefix: '/assets/',
      decorateReply: false,
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
  app.get('/admin/login', sendSPA);
  app.get('/admin/settings', sendSPA);
  app.get('/admin/payments', sendSPA);
  app.get('/admin/apps', sendSPA);
  app.get('/admin/apps/new', sendSPA);
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
      hasAdmin: (await new AuthRepository(app.db).countAdmins()) > 0,
    };
  });

  app.get('/v1/admin/payment-settings', { preHandler: requirePaymentsManage }, async () => {
    return new PaymentSettingsService(app.db, app.appEnv).getOverview();
  });

  app.get('/v1/admin/system-settings/smtp', { preHandler: requireSettingsManage }, async () => {
    return new SmtpSettingsService(app.db, app.appEnv).getOverview();
  });

  app.get('/v1/admin/system-settings/alerting', { preHandler: requireSettingsManage }, async () => {
    return new AlertingSettingsService(app.db, app.appEnv).getOverview();
  });

  app.get('/v1/admin/system-settings/qiniu', { preHandler: requireSettingsManage }, async () => {
    return new QiniuSettingsService(app.db, app.appEnv).getOverview();
  });

  app.get('/v1/admin/system-settings/site', { preHandler: requireSettingsManage }, async () => {
    return new SiteSettingsService(app.db, app.appEnv).getOverview();
  });

  app.get(
    '/v1/admin/system-settings/content-import',
    { preHandler: requireSettingsManage },
    async () => {
      return new ContentImportSettingsService(app.db, app.appEnv).getOverview();
    },
  );

  app.get(
    '/v1/admin/delivery-settings/:appCode',
    { preHandler: requireAppsManage },
    async (request) => {
      const params = adminAppCodeParamsSchema.parse(request.params);
      return new DeliverySettingsService(app.db, app.appEnv).getOverview(params.appCode);
    },
  );

  app.put(
    '/v1/admin/delivery-settings/:appCode',
    { preHandler: requireAppsManage },
    async (request) => {
      const params = adminAppCodeParamsSchema.parse(request.params);
      const payload = adminUpsertDeliverySettingsSchema.parse(request.body);
      const result = await new DeliverySettingsService(app.db, app.appEnv).upsertSettings(
        params.appCode,
        payload,
        request.user.sub,
      );
      await recordAudit(request, {
        action: 'admin.delivery_settings.updated',
        resourceType: 'delivery_settings',
        resourceId: params.appCode,
        summary: `Updated delivery settings for ${params.appCode}`,
      });
      return result;
    },
  );

  app.delete(
    '/v1/admin/delivery-settings/:appCode',
    { preHandler: requireAppsManage },
    async (request) => {
      const params = adminAppCodeParamsSchema.parse(request.params);
      await new DeliverySettingsService(app.db, app.appEnv).deleteSettings(params.appCode);
      await recordAudit(request, {
        action: 'admin.delivery_settings.deleted',
        resourceType: 'delivery_settings',
        resourceId: params.appCode,
        summary: `Deleted delivery settings for ${params.appCode}`,
      });
      return { ok: true };
    },
  );

  app.get('/v1/admin/orders', { preHandler: requireOrdersView }, async (request) => {
    const query = adminListOrdersQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listOrders(query);
  });

  app.post(
    '/v1/admin/orders/:orderNo/reconcile',
    { preHandler: requireOrdersReconcile },
    async (request) => {
      const params = adminOrderParamsSchema.parse(request.params);
      const result = await new AdminService(app.db, app.appEnv).reconcileOrder(params.orderNo);
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
      const result = await new AdminService(app.db, app.appEnv).cancelOrder(params.orderNo);
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
      const result = await new AdminService(app.db, app.appEnv).refundOrder(params.orderNo);
      await recordAudit(request, {
        action: 'admin.order.refunded',
        resourceType: 'order',
        resourceId: params.orderNo,
        summary: `Refunded order ${params.orderNo}`,
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
    return new AdminService(app.db, app.appEnv).getOrderDetail(params.orderNo);
  });

  app.get('/v1/admin/installs', { preHandler: requireInstallsView }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listInstalls(query);
  });

  app.get('/v1/admin/entitlements', { preHandler: requireLicensesManage }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listEntitlements(query);
  });

  app.post(
    '/v1/admin/entitlements/grant',
    { preHandler: requireLicensesManage },
    async (request) => {
      const payload = adminGrantEntitlementSchema.parse(request.body);
      const result = await new AdminService(app.db, app.appEnv).grantEntitlement(
        payload,
        request.user.sub,
      );
      await recordAudit(request, {
        action: 'admin.entitlement.granted',
        resourceType: 'entitlement_grant',
        resourceId: result.sourceId,
        summary: `Granted ${payload.planCode} to ${payload.userEmail}`,
        meta: {
          userId: result.user.id,
          planCode: payload.planCode,
        },
      });
      return result;
    },
  );

  app.post(
    '/v1/admin/entitlements/:entitlementId/revoke',
    { preHandler: requireLicensesManage },
    async (request) => {
      const params = adminEntitlementParamsSchema.parse(request.params);
      const result = await new AdminService(app.db, app.appEnv).revokeEntitlement(
        params.entitlementId,
        request.user.sub,
      );
      await recordAudit(request, {
        action: 'admin.entitlement.revoked',
        resourceType: 'entitlement',
        resourceId: params.entitlementId,
        summary: `Revoked entitlement ${params.entitlementId}`,
        meta: {
          revokedCount: result.revokedCount,
          sourceType: result.sourceType,
          sourceId: result.sourceId,
        },
      });
      return result;
    },
  );

  app.get('/v1/admin/events', { preHandler: requireObservabilityView }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listEvents(query);
  });

  app.get(
    '/v1/admin/billing-webhooks',
    { preHandler: requireObservabilityView },
    async (request) => {
      const query = adminListQuerySchema.parse(request.query);
      return new AdminService(app.db, app.appEnv).listBillingWebhookEvents(query);
    },
  );

  app.get('/v1/admin/observability/summary', { preHandler: requireObservabilityView }, async () => {
    return new AdminService(app.db, app.appEnv).getObservabilitySummary();
  });

  app.get('/v1/admin/jobs', { preHandler: requireObservabilityView }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listJobRuns(query);
  });

  app.post(
    '/v1/admin/jobs/:jobId/retry',
    { preHandler: requireObservabilityView },
    async (request) => {
      const params = adminJobRunParamsSchema.parse(request.params);
      const result = await new AdminService(app.db, app.appEnv).retryJobRun(params.jobId);
      await recordAudit(request, {
        action: 'admin.job.retried',
        resourceType: 'job_run',
        resourceId: params.jobId,
        summary: `Retried job ${params.jobId}`,
        meta: {
          kind: result.kind,
        },
      });
      return result;
    },
  );

  app.get('/v1/admin/audit-logs', { preHandler: requireObservabilityView }, async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listAuditLogs(query);
  });

  app.put(
    '/v1/admin/payment-settings/wechat',
    { preHandler: requirePaymentsManage },
    async (request) => {
      const payload = wechatPaymentSettingsSchema.parse(request.body);
      const result = await new PaymentSettingsService(app.db, app.appEnv).upsertWechatSettings(
        payload,
        request.user.sub,
      );
      await recordAudit(request, {
        action: 'admin.payment_settings.updated',
        resourceType: 'payment_provider',
        resourceId: 'wechat_pay',
        summary: 'Updated WeChat Pay settings',
      });
      return result;
    },
  );

  app.put(
    '/v1/admin/payment-settings/alipay',
    { preHandler: requirePaymentsManage },
    async (request) => {
      const payload = alipayPaymentSettingsSchema.parse(request.body);
      const result = await new PaymentSettingsService(app.db, app.appEnv).upsertAlipaySettings(
        payload,
        request.user.sub,
      );
      await recordAudit(request, {
        action: 'admin.payment_settings.updated',
        resourceType: 'payment_provider',
        resourceId: 'alipay',
        summary: 'Updated Alipay settings',
      });
      return result;
    },
  );

  app.delete(
    '/v1/admin/payment-settings/:provider',
    { preHandler: requirePaymentsManage },
    async (request) => {
      const params = paymentProviderParamsSchema.parse(request.params);
      await new PaymentSettingsService(app.db, app.appEnv).clearProviderSettings(params.provider);
      await recordAudit(request, {
        action: 'admin.payment_settings.cleared',
        resourceType: 'payment_provider',
        resourceId: params.provider,
        summary: `Cleared ${params.provider} settings`,
      });
      return { ok: true };
    },
  );

  app.put(
    '/v1/admin/system-settings/smtp',
    { preHandler: requireSettingsManage },
    async (request) => {
      const payload = smtpSettingsSchema.parse(request.body);
      const result = await new SmtpSettingsService(app.db, app.appEnv).upsertSettings(
        payload,
        request.user.sub,
      );
      await recordAudit(request, {
        action: 'admin.smtp_settings.updated',
        resourceType: 'system_setting',
        resourceId: 'smtp',
        summary: 'Updated SMTP settings',
      });
      return result;
    },
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
      await new SmtpSettingsService(app.db, app.appEnv).clearSettings();
      await recordAudit(request, {
        action: 'admin.smtp_settings.cleared',
        resourceType: 'system_setting',
        resourceId: 'smtp',
        summary: 'Cleared SMTP settings',
      });
      return { ok: true };
    },
  );

  app.put(
    '/v1/admin/system-settings/alerting',
    { preHandler: requireSettingsManage },
    async (request) => {
      const payload = alertingSettingsSchema.parse(request.body);
      const result = await new AlertingSettingsService(app.db, app.appEnv).upsertSettings(
        payload,
        request.user.sub,
      );
      await recordAudit(request, {
        action: 'admin.alerting_settings.updated',
        resourceType: 'system_setting',
        resourceId: 'alerting',
        summary: 'Updated alerting settings',
        meta: {
          enabled: result.values.enabled,
          emailEnabled: result.values.email.enabled,
          webhookEnabled: result.values.webhook.enabled,
          minimumLevel: result.values.minimumLevel,
        },
      });
      return result;
    },
  );

  app.delete(
    '/v1/admin/system-settings/alerting',
    { preHandler: requireSettingsManage },
    async (request) => {
      await new AlertingSettingsService(app.db, app.appEnv).clearSettings();
      await recordAudit(request, {
        action: 'admin.alerting_settings.cleared',
        resourceType: 'system_setting',
        resourceId: 'alerting',
        summary: 'Cleared alerting settings',
      });
      return { cleared: true };
    },
  );

  app.put(
    '/v1/admin/system-settings/qiniu',
    { preHandler: requireSettingsManage },
    async (request) => {
      const payload = qiniuSettingsSchema.parse(request.body);
      const result = await new QiniuSettingsService(app.db, app.appEnv).upsertSettings(
        payload,
        request.user.sub,
      );
      await recordAudit(request, {
        action: 'admin.qiniu_settings.updated',
        resourceType: 'system_setting',
        resourceId: 'qiniu',
        summary: 'Updated Qiniu settings',
      });
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
      await new QiniuSettingsService(app.db, app.appEnv).clearSettings();
      await recordAudit(request, {
        action: 'admin.qiniu_settings.cleared',
        resourceType: 'system_setting',
        resourceId: 'qiniu',
        summary: 'Cleared Qiniu settings',
      });
      return { ok: true };
    },
  );

  app.put(
    '/v1/admin/system-settings/site',
    { preHandler: requireSettingsManage },
    async (request) => {
      const payload = siteSettingsSchema.parse(request.body);
      const result = await new SiteSettingsService(app.db, app.appEnv).upsertSettings(
        payload,
        request.user.sub,
      );
      await recordAudit(request, {
        action: 'admin.site_settings.updated',
        resourceType: 'system_setting',
        resourceId: 'site',
        summary: 'Updated site settings',
      });
      return result;
    },
  );

  app.delete(
    '/v1/admin/system-settings/site',
    { preHandler: requireSettingsManage },
    async (request) => {
      await new SiteSettingsService(app.db, app.appEnv).clearSettings();
      await recordAudit(request, {
        action: 'admin.site_settings.cleared',
        resourceType: 'system_setting',
        resourceId: 'site',
        summary: 'Cleared site settings',
      });
      return { ok: true };
    },
  );

  app.get(
    '/v1/admin/system-settings/public-pages',
    { preHandler: requireSettingsManage },
    async () => {
      return new PublicPagesSettingsService(app.db, app.appEnv).getOverview();
    },
  );

  app.put(
    '/v1/admin/system-settings/public-pages',
    { preHandler: requireSettingsManage },
    async (request) => {
      const payload = publicPagesSettingsSchema.parse(request.body);
      const result = await new PublicPagesSettingsService(app.db, app.appEnv).upsertSettings(
        payload,
        request.user.sub,
      );
      await recordAudit(request, {
        action: 'admin.public_pages_settings.updated',
        resourceType: 'system_setting',
        resourceId: 'public_pages',
        summary: 'Updated public pages settings',
      });
      return result;
    },
  );

  app.delete(
    '/v1/admin/system-settings/public-pages',
    { preHandler: requireSettingsManage },
    async (request) => {
      await new PublicPagesSettingsService(app.db, app.appEnv).clearSettings();
      await recordAudit(request, {
        action: 'admin.public_pages_settings.cleared',
        resourceType: 'system_setting',
        resourceId: 'public_pages',
        summary: 'Cleared public pages settings',
      });
      return { ok: true };
    },
  );

  app.put(
    '/v1/admin/system-settings/content-import',
    { preHandler: requireSettingsManage },
    async (request) => {
      const payload = contentImportSettingsSchema.parse(request.body);
      const result = await new ContentImportSettingsService(app.db, app.appEnv).upsertSettings(
        payload,
        request.user.sub,
      );
      await recordAudit(request, {
        action: 'admin.content_import_settings.updated',
        resourceType: 'system_setting',
        resourceId: 'content_import',
        summary: 'Updated content import settings',
      });
      return result;
    },
  );

  app.delete(
    '/v1/admin/system-settings/content-import',
    { preHandler: requireSettingsManage },
    async (request) => {
      await new ContentImportSettingsService(app.db, app.appEnv).clearSettings();
      await recordAudit(request, {
        action: 'admin.content_import_settings.cleared',
        resourceType: 'system_setting',
        resourceId: 'content_import',
        summary: 'Cleared content import settings',
      });
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
    async (request) => {
      const payload = qiniuUploadTokenSchema.parse(request.body);
      return new QiniuSettingsService(app.db, app.appEnv).createUploadToken(payload);
    },
  );

  // ─── User Management ────────────────────────────────────────────────────

  app.get('/v1/admin/users', { preHandler: requireUsersView }, async (request) => {
    const query = adminListUsersQuerySchema.parse(request.query);
    return new AdminService(app.db, app.appEnv).listUsers(query);
  });

  app.get('/v1/admin/users/:userId', { preHandler: requireUsersView }, async (request) => {
    const params = adminUserIdParamsSchema.parse(request.params);
    return new AdminService(app.db, app.appEnv).getUser(params.userId);
  });

  app.put('/v1/admin/users/:userId', { preHandler: requireUsersEdit }, async (request, reply) => {
    const params = adminUserIdParamsSchema.parse(request.params);
    const payload = adminUpdateUserSchema.parse(request.body);
    const [existing, actor] = await Promise.all([
      new AuthRepository(app.db).findUserById(params.userId),
      new AuthRepository(app.db).findUserById(request.user.sub),
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

    const result = await new AdminService(app.db, app.appEnv).updateUser(
      params.userId,
      payload,
      request.user.sub,
    );
    await recordAudit(request, {
      action: 'admin.user.updated',
      resourceType: 'user',
      resourceId: params.userId,
      summary: `Updated user ${params.userId}`,
      meta: {
        before: {
          displayName: existing.displayName,
          role: existing.role,
          status: existing.status,
        },
        after: {
          displayName: result.displayName,
          role: result.role,
          status: result.status,
        },
      },
    });
    return result;
  });

  app.post(
    '/v1/admin/users/:userId/suspend',
    { preHandler: requireUsersSuspend },
    async (request) => {
      const params = adminUserIdParamsSchema.parse(request.params);
      const existing = await new AuthRepository(app.db).findUserById(params.userId);
      const result = await new AdminService(app.db, app.appEnv).suspendUser(
        params.userId,
        request.user.sub,
      );
      await recordAudit(request, {
        action: 'admin.user.suspended',
        resourceType: 'user',
        resourceId: params.userId,
        summary: `Suspended user ${params.userId}`,
        meta: {
          beforeStatus: existing?.status ?? null,
          afterStatus: result.status,
        },
      });
      return result;
    },
  );

  app.post(
    '/v1/admin/users/:userId/activate',
    { preHandler: requireUsersSuspend },
    async (request) => {
      const params = adminUserIdParamsSchema.parse(request.params);
      const existing = await new AuthRepository(app.db).findUserById(params.userId);
      const result = await new AdminService(app.db, app.appEnv).activateUser(
        params.userId,
        request.user.sub,
      );
      await recordAudit(request, {
        action: 'admin.user.activated',
        resourceType: 'user',
        resourceId: params.userId,
        summary: `Activated user ${params.userId}`,
        meta: {
          beforeStatus: existing?.status ?? null,
          afterStatus: result.status,
        },
      });
      return result;
    },
  );

  app.post(
    '/v1/admin/users/:userId/reset-password',
    { preHandler: requireUsersResetPassword },
    async (request) => {
      const params = adminUserIdParamsSchema.parse(request.params);
      const result = await new AdminService(app.db, app.appEnv).resetUserPassword(
        params.userId,
        request.user.sub,
      );
      await recordAudit(request, {
        action: 'admin.user.password_reset',
        resourceType: 'user',
        resourceId: params.userId,
        summary: `Reset password for user ${params.userId}`,
      });
      return result;
    },
  );
};
