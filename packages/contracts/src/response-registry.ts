import { storageResponseContracts } from './storage.js';
import { UpgradeOptionsSchema, upgradeReleaseSchema } from './hosting-upgrade.js';
import { HandoverListSchema, HandoverResultSchema } from './hosting-handover.js';
import { AppReadinessSchema } from './app-readiness.js';
import { HostingIncidentsSchema, HostingIncidentEventsSchema } from './hosting-monitor.js';
import { ItemRefundLedgerSchema } from './item-refund.js';
import { HostingPurchasesSchema, HostingFulfillmentsSchema } from './hosting-purchase.js';
import { HostingOfferSchema, HostingOfferListSchema } from './hosting-offer.js';
import {
  HostingServiceResponseSchema,
  AdminHostingServiceResponseSchema,
} from './hosting-service.js';
import { AdminDeploymentsSchema } from './admin-deployments.js';
import { externalResponseContracts, nonJsonResponseRoutes } from './external-responses.js';
import { z } from 'zod';
import { HostingExitResponseSchema } from './hosting-exit.js';
import {
  HostingClaimSchema,
  HostingOverviewSchema,
  HostingOperationSchema,
  HostingOperationClaimSchema,
  DeploymentDomainsSchema,
  DeploymentDomainSchema,
  HostingIngressItemSchema,
  DeploymentOptionsSchema,
  HostingNodesResponseSchema,
  HostingNodeCreatedSchema,
} from './hosting.js';
import * as models from './models.js';
import * as core from './core-responses.js';
const clientResponseContracts = [
  {
    method: 'GET',
    path: '/v1/admin/deployments/:deploymentId/upgrades',
    schema: UpgradeOptionsSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/deployments/:deploymentId/upgrades',
    schema: z.object({ operationId: z.uuid() }),
  },
  {
    method: 'GET',
    path: '/v1/hosting/nodes/:nodeId/operations/:operationId/upgrade',
    schema: upgradeReleaseSchema,
  },
  { method: 'GET', path: '/v1/deployments/:deploymentId/handover', schema: HandoverListSchema },
  { method: 'POST', path: '/v1/deployments/:deploymentId/handover', schema: HandoverResultSchema },
  {
    method: 'GET',
    path: '/v1/admin/deployments/:deploymentId/handover',
    schema: HandoverListSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/deployments/:deploymentId/handover',
    schema: HandoverResultSchema,
  },
  {
    method: 'GET',
    path: '/v1/deployments/:deploymentId/hosting-exit',
    schema: HostingExitResponseSchema,
  },
  {
    method: 'GET',
    path: '/v1/admin/deployments/:deploymentId/hosting-exit',
    schema: HostingExitResponseSchema,
  },
  {
    method: 'POST',
    path: '/v1/deployments/:deploymentId/hosting-exit',
    schema: HostingExitResponseSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/deployments/:deploymentId/hosting-exit',
    schema: HostingExitResponseSchema,
  },
  {
    method: 'GET',
    path: '/v1/billing/hosting-offers/:appCode',
    schema: z.object({ items: z.array(HostingOfferSchema) }),
  },
  {
    method: 'GET',
    path: '/v1/billing/orders/:orderNo/item-refunds',
    schema: ItemRefundLedgerSchema,
  },
  {
    method: 'GET',
    path: '/v1/admin/billing/orders/:orderNo/item-refunds',
    schema: ItemRefundLedgerSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/billing/orders/:orderNo/item-refunds',
    schema: ItemRefundLedgerSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/billing/orders/:orderNo/item-refunds/:refundId/reconcile',
    schema: ItemRefundLedgerSchema,
  },
  { method: 'GET', path: '/v1/billing/hosting-purchases/me', schema: HostingPurchasesSchema },
  { method: 'GET', path: '/v1/billing/hosting-fulfillments/me', schema: HostingFulfillmentsSchema },
  {
    method: 'GET',
    path: '/v1/billing/hosting-fulfillments/:orderNo',
    schema: HostingFulfillmentsSchema,
  },
  {
    method: 'GET',
    path: '/v1/admin/billing/hosting-fulfillments/:orderNo',
    schema: HostingFulfillmentsSchema,
  },
  { method: 'GET', path: '/v1/admin/billing/hosting-offers', schema: HostingOfferListSchema },
  { method: 'POST', path: '/v1/admin/billing/hosting-offers', schema: HostingOfferSchema },
  { method: 'PUT', path: '/v1/admin/billing/hosting-offers/:offerId', schema: HostingOfferSchema },
  { method: 'GET', path: '/v1/admin/deployments', schema: AdminDeploymentsSchema },
  {
    method: 'GET',
    path: '/v1/deployments/:deploymentId/hosting-service',
    schema: HostingServiceResponseSchema,
  },
  {
    method: 'GET',
    path: '/v1/admin/deployments/:deploymentId/hosting-service',
    schema: AdminHostingServiceResponseSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/deployments/:deploymentId/hosting-service',
    schema: AdminHostingServiceResponseSchema,
  },
  { method: 'GET', path: '/v1/admin/apps/:appCode/readiness', schema: AppReadinessSchema },
  { method: 'GET', path: '/v1/admin/hosting/overview', schema: HostingOverviewSchema },
  { method: 'GET', path: '/v1/admin/hosting/incidents', schema: HostingIncidentsSchema },
  {
    method: 'GET',
    path: '/v1/admin/hosting/incidents/:incidentId/events',
    schema: HostingIncidentEventsSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/hosting/instances/:param/operations',
    schema: HostingOperationSchema,
  },
  {
    method: 'POST',
    path: '/v1/hosting/nodes/:param/operations/claim',
    schema: HostingOperationClaimSchema,
  },
  {
    method: 'POST',
    path: '/v1/hosting/nodes/:param/operations/complete',
    schema: z.object({ ok: z.boolean() }),
  },
  { method: 'GET', path: '/v1/deployments/:param/domains', schema: DeploymentDomainsSchema },
  { method: 'POST', path: '/v1/deployments/:param/domains', schema: DeploymentDomainSchema },
  {
    method: 'POST',
    path: '/v1/deployments/:param/domains/:param/verify',
    schema: DeploymentDomainSchema,
  },
  {
    method: 'DELETE',
    path: '/v1/deployments/:param/domains/:param',
    schema: z.object({ ok: z.boolean() }),
  },
  {
    method: 'POST',
    path: '/v1/hosting/nodes/:param/ingress/:param/domains/:param',
    schema: z.object({ ok: z.boolean() }),
  },
  {
    method: 'GET',
    path: '/v1/hosting/nodes/:param/ingress',
    schema: z.object({
      items: z.array(HostingIngressItemSchema),
    }),
  },
  {
    method: 'POST',
    path: '/v1/hosting/nodes/:param/ingress/:param',
    schema: z.object({ ok: z.boolean() }),
  },
  { method: 'POST', path: '/v1/hosting/nodes/:param/claim', schema: HostingClaimSchema },
  {
    method: 'POST',
    path: '/v1/hosting/nodes/:param/complete',
    schema: z.object({ ok: z.boolean() }),
  },
  { method: 'GET', path: '/v1/deployments/options', schema: DeploymentOptionsSchema },
  {
    method: 'POST',
    path: '/v1/deployments/:param/allocate',
    schema: models.DeploymentSummarySchema,
  },
  { method: 'GET', path: '/v1/admin/hosting/nodes', schema: HostingNodesResponseSchema },
  { method: 'POST', path: '/v1/admin/hosting/nodes', schema: HostingNodeCreatedSchema },
  {
    method: 'PATCH',
    path: '/v1/admin/hosting/nodes/:param',
    schema: z.object({ ok: z.boolean() }),
  },
  {
    method: 'POST',
    path: '/v1/hosting/nodes/:param/report',
    schema: z.object({ ok: z.boolean() }),
  },
  { method: 'GET', path: '/v1/admin/orders', schema: models.OrdersResponseSchema },
  { method: 'GET', path: '/v1/admin/docs/spaces', schema: models.AdminDocSpaceListResponseSchema },
  { method: 'GET', path: '/v1/admin/docs/spaces/:param', schema: models.AdminDocSpaceDetailSchema },
  { method: 'POST', path: '/v1/admin/docs/spaces', schema: models.DocSpaceSchema },
  { method: 'PUT', path: '/v1/admin/docs/spaces/:param', schema: models.DocSpaceSchema },
  { method: 'GET', path: '/v1/admin/docs/pages/:param', schema: models.DocPageSchema },
  { method: 'POST', path: '/v1/admin/docs/pages', schema: models.DocPageSchema },
  { method: 'PUT', path: '/v1/admin/docs/pages/:param', schema: models.DocPageSchema },
  { method: 'GET', path: '/v1/admin/content', schema: models.ContentListResponseSchema },
  { method: 'GET', path: '/v1/admin/content/:param', schema: models.ContentItemSchema },
  { method: 'POST', path: '/v1/admin/content', schema: models.ContentItemSchema },
  { method: 'PUT', path: '/v1/admin/content/:param', schema: models.ContentItemSchema },
  { method: 'POST', path: '/v1/admin/content/import/wordpress', schema: models.ContentItemSchema },
  { method: 'POST', path: '/v1/admin/content/import/notion', schema: models.ContentItemSchema },
  { method: 'POST', path: '/v1/admin/content/import/wechat', schema: models.ContentItemSchema },
  { method: 'GET', path: '/v1/admin/orders/:param', schema: models.OrderDetailSchema },
  {
    method: 'POST',
    path: '/v1/admin/orders/:param/reconcile',
    schema: models.ReconcileResponseSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/orders/:param/cancel',
    schema: models.OrderAdminActionResultSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/orders/:param/refund',
    schema: models.OrderAdminActionResultSchema,
  },
  { method: 'GET', path: '/v1/admin/installs', schema: models.InstallsResponseSchema },
  { method: 'GET', path: '/v1/admin/tickets', schema: models.SupportTicketsResponseSchema },
  { method: 'GET', path: '/v1/admin/tickets/:param', schema: models.SupportTicketDetailSchema },
  {
    method: 'POST',
    path: '/v1/admin/tickets/:param/messages',
    schema: models.SupportTicketDetailSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/tickets/:param/assign',
    schema: models.SupportTicketDetailSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/tickets/:param/status',
    schema: models.SupportTicketDetailSchema,
  },
  { method: 'GET', path: '/v1/admin/entitlements', schema: models.EntitlementsResponseSchema },
  {
    method: 'POST',
    path: '/v1/admin/entitlements/grant',
    schema: models.GrantEntitlementResultSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/entitlements/:param/revoke',
    schema: models.RevokeEntitlementResultSchema,
  },
  { method: 'GET', path: '/v1/admin/events', schema: models.EventsResponseSchema },
  { method: 'GET', path: '/v1/admin/billing-webhooks', schema: models.WebhooksResponseSchema },
  { method: 'GET', path: '/v1/admin/jobs', schema: models.JobRunsResponseSchema },
  { method: 'POST', path: '/v1/admin/jobs/:param/retry', schema: models.JobRetryResponseSchema },
  { method: 'GET', path: '/v1/admin/audit-logs', schema: models.AuditLogsResponseSchema },
  {
    method: 'GET',
    path: '/v1/admin/observability/summary',
    schema: models.ObservabilitySummarySchema,
  },
  {
    method: 'GET',
    path: '/v1/admin/notifications',
    schema: models.AdminNotificationsResponseSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/notifications/announcements',
    schema: models.PublishAnnouncementResultSchema,
  },
  { method: 'GET', path: '/v1/admin/users', schema: models.AdminUsersResponseSchema },
  { method: 'GET', path: '/v1/admin/users/:param', schema: models.AdminUserDetailSchema },
  { method: 'PUT', path: '/v1/admin/users/:param', schema: models.AdminUserSchema },
  { method: 'POST', path: '/v1/admin/users/:param/suspend', schema: models.AdminUserSchema },
  { method: 'POST', path: '/v1/admin/users/:param/activate', schema: models.AdminUserSchema },
  {
    method: 'POST',
    path: '/v1/admin/users/:param/reset-password',
    schema: models.AdminResetPasswordResultSchema,
  },
  {
    method: 'GET',
    path: '/v1/apps',
    schema: z.object({ items: z.array(models.AppWithDetailsSchema) }),
  },
  { method: 'GET', path: '/v1/apps/:param/catalog', schema: models.AppCatalogSchema },
  {
    method: 'GET',
    path: '/v1/admin/apps',
    schema: z.object({ items: z.array(models.AppWithDetailsSchema) }),
  },
  {
    method: 'GET',
    path: '/v1/plans',
    schema: z.object({ items: z.array(models.PlanSummarySchema) }),
  },
  {
    method: 'GET',
    path: '/v1/features',
    schema: z.object({ items: z.array(models.FeatureSummarySchema) }),
  },
  { method: 'GET', path: '/v1/catalog', schema: models.CatalogSnapshotSchema },
  { method: 'PUT', path: '/v1/admin/apps/:param', schema: models.AppWithDetailsSchema },
  { method: 'POST', path: '/v1/admin/apps/:param/archive', schema: models.AppWithDetailsSchema },
  {
    method: 'POST',
    path: '/v1/admin/apps/:param/purge-config',
    schema: models.AppWithDetailsSchema,
  },
  { method: 'POST', path: '/v1/admin/apps/:param/secrets', schema: models.AppSecretCreatedSchema },
  {
    method: 'POST',
    path: '/v1/admin/apps/:param/secrets/:param/revoke',
    schema: z.object({
      appCode: z.string(),
      appName: z.string(),
      secretId: z.uuid(),
      hint: z.string(),
      status: z.string(),
      expiresAt: z.string().nullable(),
      lastUsedAt: z.string().nullable(),
    }),
  },
  {
    method: 'POST',
    path: '/v1/admin/apps/:param/delivery-manifest/sync',
    schema: models.AppWithDetailsSchema,
  },
  { method: 'GET', path: '/v1/admin/bootstrap-status', schema: models.BootstrapStatusSchema },
  { method: 'POST', path: '/v1/auth/session/login', schema: core.browserAuthResponseSchema },
  { method: 'POST', path: '/v1/auth/session/register', schema: core.browserAuthResponseSchema },
  {
    method: 'GET',
    path: '/v1/me',
    schema: core.meResponseSchema,
  },
  { method: 'PATCH', path: '/v1/me', schema: models.UpdateCurrentUserResponseSchema },
  { method: 'POST', path: '/v1/me/change-password', schema: models.ChangePasswordResponseSchema },
  { method: 'POST', path: '/v1/auth/verify-email', schema: models.VerifyEmailResponseSchema },
  {
    method: 'POST',
    path: '/v1/auth/resend-verification',
    schema: models.ResendVerificationResponseSchema,
  },
  { method: 'POST', path: '/v1/auth/forgot-password', schema: models.ForgotPasswordResponseSchema },
  { method: 'POST', path: '/v1/auth/reset-password', schema: models.ResetPasswordResponseSchema },
  {
    method: 'POST',
    path: '/v1/auth/session/logout',
    schema: z.object({ loggedOut: z.literal(true) }),
  },
  { method: 'GET', path: '/v1/content', schema: models.ContentListResponseSchema },
  { method: 'GET', path: '/v1/content/:param', schema: models.ContentItemSchema },
  {
    method: 'GET',
    path: '/v1/admin/delivery-settings/:param',
    schema: models.DeliverySettingsOverviewSchema,
  },
  {
    method: 'PUT',
    path: '/v1/admin/delivery-settings/:param',
    schema: models.DeliverySettingsOverviewSchema,
  },
  {
    method: 'DELETE',
    path: '/v1/admin/delivery-settings/:param',
    schema: z.object({ ok: z.literal(true) }),
  },
  { method: 'GET', path: '/v1/docs/spaces', schema: models.PublicDocSpaceListResponseSchema },
  { method: 'GET', path: '/v1/docs/spaces/:param', schema: models.PublicDocSpaceDetailSchema },
  { method: 'GET', path: '/v1/docs/spaces/:param/page', schema: models.PublicDocPageDetailSchema },
  { method: 'GET', path: '/v1/docs/search-index', schema: models.DocsSearchIndexResponseSchema },
  { method: 'POST', path: '/v1/docs/feedback', schema: models.DocFeedbackResultSchema },
  {
    method: 'GET',
    path: '/v1/admin/media/qiniu/images',
    schema: models.QiniuImageListResultSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/media/qiniu/upload-token',
    schema: models.QiniuUploadTokenResultSchema,
  },
  {
    method: 'GET',
    path: '/v1/admin/payment-settings',
    schema: models.PaymentSettingsOverviewSchema,
  },
  {
    method: 'PUT',
    path: '/v1/admin/payment-settings/wechat',
    schema: models.PaymentProviderConfigSchema,
  },
  {
    method: 'PUT',
    path: '/v1/admin/payment-settings/alipay',
    schema: models.PaymentProviderConfigSchema,
  },
  {
    method: 'DELETE',
    path: '/v1/admin/payment-settings/:param',
    schema: z.object({ ok: z.literal(true) }),
  },
  {
    method: 'GET',
    path: '/v1/admin/system-settings/smtp',
    schema: models.SmtpSettingsOverviewSchema,
  },
  {
    method: 'PUT',
    path: '/v1/admin/system-settings/smtp',
    schema: models.SmtpSettingsOverviewSchema,
  },
  {
    method: 'DELETE',
    path: '/v1/admin/system-settings/smtp',
    schema: z.object({ ok: z.literal(true) }),
  },
  {
    method: 'POST',
    path: '/v1/admin/system-settings/rotate-secrets',
    schema: z.object({ checked: z.number().int(), rotated: z.number().int() }),
  },
  {
    method: 'POST',
    path: '/v1/admin/system-settings/smtp/connection-test',
    schema: z.object({ ok: z.literal(true) }),
  },
  {
    method: 'POST',
    path: '/v1/admin/system-settings/smtp/test',
    schema: models.SmtpTestEmailResultSchema,
  },
  {
    method: 'GET',
    path: '/v1/admin/system-settings/alerting',
    schema: models.AlertingSettingsOverviewSchema,
  },
  {
    method: 'PUT',
    path: '/v1/admin/system-settings/alerting',
    schema: models.AlertingSettingsOverviewSchema,
  },
  {
    method: 'DELETE',
    path: '/v1/admin/system-settings/alerting',
    schema: z.object({ ok: z.literal(true) }),
  },
  {
    method: 'GET',
    path: '/v1/admin/system-settings/qiniu',
    schema: models.QiniuSettingsOverviewSchema,
  },
  {
    method: 'PUT',
    path: '/v1/admin/system-settings/qiniu',
    schema: models.QiniuSettingsOverviewSchema,
  },
  {
    method: 'DELETE',
    path: '/v1/admin/system-settings/qiniu',
    schema: z.object({ ok: z.literal(true) }),
  },
  {
    method: 'POST',
    path: '/v1/admin/system-settings/qiniu/test',
    schema: models.QiniuTestConnectionResultSchema,
  },
  {
    method: 'GET',
    path: '/v1/admin/system-settings/site',
    schema: models.SiteSettingsOverviewSchema,
  },
  {
    method: 'PUT',
    path: '/v1/admin/system-settings/site',
    schema: models.SiteSettingsOverviewSchema,
  },
  {
    method: 'DELETE',
    path: '/v1/admin/system-settings/site',
    schema: z.object({ ok: z.literal(true) }),
  },
  {
    method: 'GET',
    path: '/v1/admin/system-settings/public-pages',
    schema: models.PublicPagesSettingsOverviewSchema,
  },
  {
    method: 'PUT',
    path: '/v1/admin/system-settings/public-pages',
    schema: models.PublicPagesSettingsOverviewSchema,
  },
  {
    method: 'DELETE',
    path: '/v1/admin/system-settings/public-pages',
    schema: z.object({ ok: z.literal(true) }),
  },
  { method: 'GET', path: '/v1/system/site-settings', schema: models.PublicSiteSettingsSchema },
  {
    method: 'GET',
    path: '/v1/admin/system-settings/content-import',
    schema: models.ContentImportSettingsOverviewSchema,
  },
  {
    method: 'PUT',
    path: '/v1/admin/system-settings/content-import',
    schema: models.ContentImportSettingsOverviewSchema,
  },
  {
    method: 'DELETE',
    path: '/v1/admin/system-settings/content-import',
    schema: z.object({ ok: z.literal(true) }),
  },
  {
    method: 'POST',
    path: '/v1/admin/system-settings/content-import/wordpress/test',
    schema: models.ContentImportWordPressTestResultSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/system-settings/content-import/notion/test',
    schema: models.ContentImportNotionTestResultSchema,
  },
  { method: 'GET', path: '/v1/admin/ai/providers', schema: models.AiProviderListResponseSchema },
  {
    method: 'GET',
    path: '/v1/admin/ai/providers/:param/models',
    schema: models.AiProviderModelsResponseSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/system-settings/ai/providers/openrouter/models',
    schema: models.AiProviderModelsResponseSchema,
  },
  {
    method: 'GET',
    path: '/v1/admin/system-settings/ai/providers/openrouter',
    schema: models.OpenRouterSettingsOverviewSchema,
  },
  {
    method: 'PUT',
    path: '/v1/admin/system-settings/ai/providers/openrouter',
    schema: models.OpenRouterSettingsOverviewSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/system-settings/ai/providers/openrouter/test',
    schema: models.OpenRouterTestConnectionResultSchema,
  },
  {
    method: 'POST',
    path: '/v1/admin/system-settings/ai/providers/openrouter/chat/completions',
    schema: models.AiChatCompletionResultSchema,
  },
  {
    method: 'DELETE',
    path: '/v1/admin/system-settings/ai/providers/openrouter',
    schema: z.object({ ok: z.literal(true) }),
  },
  { method: 'GET', path: '/v1/billing/orders/me', schema: models.MyOrdersResponseSchema },
  {
    method: 'POST',
    path: '/v1/billing/orders/:param/sync',
    schema: models.ReconcileResponseSchema.and(z.object({ order: models.OrderSchema })),
  },
  { method: 'GET', path: '/v1/entitlements/me', schema: models.MyEntitlementsResponseSchema },
  { method: 'GET', path: '/v1/notifications/me', schema: models.NotificationsResponseSchema },
  {
    method: 'GET',
    path: '/v1/notifications/me/unread-count',
    schema: models.NotificationUnreadCountSchema,
  },
  { method: 'POST', path: '/v1/notifications/:param/read', schema: models.NotificationItemSchema },
  {
    method: 'POST',
    path: '/v1/notifications/read-all',
    schema: z.object({ updatedCount: z.number() }),
  },
  {
    method: 'POST',
    path: '/v1/notifications/:param/archive',
    schema: models.NotificationItemSchema,
  },
  { method: 'GET', path: '/v1/tickets/me', schema: models.SupportTicketsResponseSchema },
  { method: 'POST', path: '/v1/tickets', schema: models.SupportTicketDetailSchema },
  { method: 'GET', path: '/v1/tickets/:param', schema: models.SupportTicketDetailSchema },
  { method: 'POST', path: '/v1/tickets/:param/messages', schema: models.SupportTicketDetailSchema },
  { method: 'POST', path: '/v1/tickets/:param/close', schema: models.SupportTicketDetailSchema },
  { method: 'POST', path: '/v1/checkout/sessions', schema: models.CheckoutSessionCreatedSchema },
  {
    method: 'GET',
    path: '/v1/checkout/sessions/:param/public',
    schema: models.CheckoutSessionPublicSchema,
  },
  {
    method: 'GET',
    path: '/v1/checkout/sessions/:param/status',
    schema: models.CheckoutSessionStatusSchema,
  },
  {
    method: 'POST',
    path: '/v1/checkout/sessions/:param/reconcile',
    schema: models.ReconcileResponseSchema,
  },
  { method: 'GET', path: '/v1/deployments/me', schema: models.DeploymentsResponseSchema },
  { method: 'POST', path: '/v1/deployments', schema: models.DeploymentSummarySchema },
  { method: 'PATCH', path: '/v1/deployments/:param', schema: models.DeploymentSummarySchema },
  {
    method: 'POST',
    path: '/v1/deployments/:param/tokens',
    schema: models.IssueDeploymentTokenResultSchema,
  },
  {
    method: 'POST',
    path: '/v1/deployments/:param/deactivate',
    schema: models.DeploymentSummarySchema,
  },
  {
    method: 'POST',
    path: '/v1/deployments/:param/actions',
    schema: z.object({ ok: z.literal(true) }),
  },
] as const satisfies readonly { method: string; path: string; schema: z.ZodType }[];
export const responseContracts = [
  ...clientResponseContracts,
  ...storageResponseContracts,
  ...externalResponseContracts,
] as const;
export function isNonJsonResponseRoute(method: string, path: string) {
  return nonJsonResponseRoutes.some((r) => r.method === method && r.path === path);
}
function matchPath(pattern: string, path: string) {
  const a = pattern.split('/');
  const b = path.split('/');
  return (
    a.length === b.length &&
    a.every((part, i) => (part.startsWith(':') && Boolean(b[i])) || part === b[i])
  );
}
export function responseSchemaFor(method: string, path: string): z.ZodType | undefined {
  const clean = path.split('?')[0] ?? '';
  return responseContracts.find(
    (r) => r.method === method.toUpperCase() && matchPath(r.path, clean),
  )?.schema;
}

/** Stable endpoint identity: response types are derived from the registered schema. */
type Endpoint = (typeof responseContracts)[number];
export type EndpointId = Endpoint extends infer E
  ? E extends { method: infer M extends string; path: infer P extends string }
    ? `${M} ${P}`
    : never
  : never;
type EndpointFor<Id extends EndpointId> = Endpoint extends infer E
  ? E extends { method: infer M extends string; path: infer P extends string }
    ? Id extends `${M} ${P}`
      ? E
      : never
    : never
  : never;
export type EndpointResponse<Id extends EndpointId> = z.output<EndpointFor<Id>['schema']>;
export function endpointContract(id: EndpointId, path: string) {
  const contract = responseContracts.find((r) => `${r.method} ${r.path}` === id);
  if (!contract || !matchPath(contract.path, path.split('?')[0] ?? ''))
    throw new Error('Request path does not match endpoint: ' + id);
  return contract;
}
