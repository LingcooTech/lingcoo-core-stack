import { pgEnum } from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['active', 'suspended']);

export const userRoleEnum = pgEnum('user_role', [
  'user',
  'admin',
  'support',
  'finance',
  'editor',
  'operator',
]);

export const intervalEnum = pgEnum('billing_interval', ['month', 'year', 'one_time']);

export const sourceTypeEnum = pgEnum('entitlement_source_type', [
  'subscription',
  'order',
  'grant',
  'trial',
]);

export const recordStatusEnum = pgEnum('record_status', [
  'active',
  'inactive',
  'cancelled',
  'expired',
]);

export const paymentProviderEnum = pgEnum('payment_provider', ['wechat_pay', 'alipay']);

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'paid',
  'failed',
  'cancelled',
  'refunded',
  'refunding',
]);

export const checkoutSessionStatusEnum = pgEnum('checkout_session_status', [
  'pending',
  'paid',
  'failed',
  'cancelled',
  'expired',
]);

export const checkoutActionTypeEnum = pgEnum('checkout_action_type', ['qr_code', 'redirect_url']);

export const paymentAttemptStatusEnum = pgEnum('payment_attempt_status', [
  'prepared',
  'paid',
  'failed',
  'cancelled',
]);

export const contentSourceEnum = pgEnum('content_source', [
  'manual',
  'wordpress',
  'notion',
  'wechat',
]);

export const contentStatusEnum = pgEnum('content_status', ['draft', 'published', 'archived']);

export const docSpaceTypeEnum = pgEnum('doc_space_type', ['product', 'app', 'internal']);

export const docSpaceStatusEnum = pgEnum('doc_space_status', ['active', 'hidden', 'archived']);

export const docPageStatusEnum = pgEnum('doc_page_status', ['draft', 'published', 'archived']);

export const notificationLevelEnum = pgEnum('notification_level', [
  'info',
  'success',
  'warning',
  'error',
]);

export const notificationStatusEnum = pgEnum('notification_status', ['unread', 'read', 'archived']);

export const supportTicketStatusEnum = pgEnum('support_ticket_status', [
  'waiting_staff',
  'waiting_user',
  'resolved',
  'closed',
]);

export const supportTicketPriorityEnum = pgEnum('support_ticket_priority', [
  'low',
  'normal',
  'high',
  'urgent',
]);

export const supportTicketCategoryEnum = pgEnum('support_ticket_category', [
  'account',
  'billing',
  'access',
  'install',
  'deployment',
  'bug',
  'feature',
  'other',
]);

export const supportTicketMessageAuthorTypeEnum = pgEnum('support_ticket_message_author_type', [
  'user',
  'admin',
  'system',
]);

export const jobRunStatusEnum = pgEnum('job_run_status', [
  'pending',
  'running',
  'succeeded',
  'failed',
  'dead',
]);

export const auditActorTypeEnum = pgEnum('audit_actor_type', ['user', 'system', 'job']);

export const auditOutcomeEnum = pgEnum('audit_outcome', ['succeeded', 'failed']);
