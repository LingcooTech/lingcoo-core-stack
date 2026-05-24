import { randomUUID } from 'node:crypto';

import type { DbClient } from '../../db/types';
import { httpError } from '../../lib/errors';
import { AuthRepository } from '../auth/repository';
import { NotificationsRepository } from './repository';

type NotificationCategory =
  | 'account'
  | 'billing'
  | 'license'
  | 'deployment'
  | 'ticket'
  | 'system'
  | 'announcement';
type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

type EventProjectionInput = {
  id: string;
  userId: string | null;
  appId: string | null;
  eventName: string;
  eventTime: Date;
  properties: Record<string, unknown>;
};

type NotificationDraft = {
  userId: string;
  category: NotificationCategory;
  level: NotificationLevel;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  sourceEventId: string;
  sourceEventName: string;
  dedupeKey: string;
  meta?: Record<string, unknown>;
};

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildNotificationFromEvent(event: EventProjectionInput): NotificationDraft | null {
  if (!event.userId) {
    return null;
  }

  const properties = asRecord(event.properties);

  switch (event.eventName) {
    case 'auth.email_verified':
      return {
        userId: event.userId,
        category: 'account',
        level: 'success',
        title: '邮箱已验证',
        body: '你的账户邮箱验证已经完成，现在可以正常使用需要实名确认的功能。',
        ctaLabel: '查看个人资料',
        ctaUrl: '/account?tab=profile',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    case 'auth.password_reset_completed':
      return {
        userId: event.userId,
        category: 'account',
        level: 'warning',
        title: '密码已重置',
        body: '你的账户密码已经通过找回流程重置。如果这不是你的操作，请尽快修改密码。',
        ctaLabel: '查看账户',
        ctaUrl: '/account?tab=profile',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    case 'auth.password_changed':
      return {
        userId: event.userId,
        category: 'account',
        level: 'success',
        title: '密码已修改',
        body: '你的账户密码已经更新。',
        ctaLabel: '查看账户',
        ctaUrl: '/account?tab=profile',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    case 'auth.profile_updated':
      return {
        userId: event.userId,
        category: 'account',
        level: 'info',
        title: '个人资料已更新',
        body: '你的账户资料已保存。',
        ctaLabel: '查看个人资料',
        ctaUrl: '/account?tab=profile',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    case 'billing.order_paid': {
      const orderNo = normalizeString(properties.orderNo) || '订单';
      return {
        userId: event.userId,
        category: 'billing',
        level: 'success',
        title: '订单支付成功',
        body: `${orderNo} 已支付，相关权益已同步到你的账户。`,
        ctaLabel: '查看订单',
        ctaUrl: '/account?tab=orders',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    }
    case 'billing.order_refunded': {
      const orderNo = normalizeString(properties.orderNo) || '订单';
      return {
        userId: event.userId,
        category: 'billing',
        level: 'warning',
        title: '订单已退款',
        body: `${orderNo} 已完成退款，关联权益会同步回收。`,
        ctaLabel: '查看订单',
        ctaUrl: '/account?tab=orders',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    }
    case 'billing.order_refund_processing': {
      const orderNo = normalizeString(properties.orderNo) || '订单';
      return {
        userId: event.userId,
        category: 'billing',
        level: 'info',
        title: '退款处理中',
        body: `${orderNo} 的退款请求已受理，系统会继续回查最终结果。`,
        ctaLabel: '查看订单',
        ctaUrl: '/account?tab=orders',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    }
    case 'billing.order_refund_failed': {
      const orderNo = normalizeString(properties.orderNo) || '订单';
      return {
        userId: event.userId,
        category: 'billing',
        level: 'error',
        title: '退款未完成',
        body: `${orderNo} 的退款回查未成功，请联系支持处理。`,
        ctaLabel: '查看订单',
        ctaUrl: '/account?tab=orders',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    }
    case 'license.entitlements_granted': {
      const sourceType = normalizeString(properties.sourceType);
      if (sourceType === 'order') {
        return null;
      }
      const planCode = normalizeString(properties.planCode) || '当前套餐';
      return {
        userId: event.userId,
        category: 'license',
        level: 'success',
        title: '授权已生效',
        body: `${planCode} 已发放到你的账户。`,
        ctaLabel: '查看我的应用',
        ctaUrl: '/account?tab=apps',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    }
    case 'admin.entitlements_revoked': {
      const planCode = normalizeString(properties.planCode) || '当前授权';
      return {
        userId: event.userId,
        category: 'license',
        level: 'warning',
        title: '授权已变更',
        body: `${planCode} 已被管理员撤销或调整。如有疑问，请联系支持。`,
        ctaLabel: '查看我的应用',
        ctaUrl: '/account?tab=apps',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
        meta: {
          entitlementId: normalizeString(properties.entitlementId) || null,
          sourceType: normalizeString(properties.sourceType) || null,
          sourceId: normalizeString(properties.sourceId) || null,
        },
      };
    }
    case 'deployment.created': {
      const appCode = normalizeString(properties.appCode) || '当前应用';
      return {
        userId: event.userId,
        category: 'deployment',
        level: 'info',
        title: '部署记录已创建',
        body: `${appCode} 的部署记录已经创建。`,
        ctaLabel: '查看部署',
        ctaUrl: '/deploy',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    }
    case 'deployment.token_issued': {
      const expiresAt = normalizeString(properties.expiresAt);
      return {
        userId: event.userId,
        category: 'deployment',
        level: 'success',
        title: '部署令牌已签发',
        body: expiresAt ? `新的部署令牌已生成，过期时间：${expiresAt}` : '新的部署令牌已生成。',
        ctaLabel: '查看部署',
        ctaUrl: '/deploy',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    }
    case 'deployment.deactivated':
      return {
        userId: event.userId,
        category: 'deployment',
        level: 'warning',
        title: '部署已停用',
        body: '一条部署记录已被停用，相关令牌也已失效。',
        ctaLabel: '查看部署',
        ctaUrl: '/deploy',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    case 'deployment.runtime_update_available':
      return {
        userId: event.userId,
        category: 'deployment',
        level: 'info',
        title: '有新的前端更新可用',
        body: '你的部署检测到了新的运行时镜像版本，可以选择立即应用或稍后处理。',
        ctaLabel: '查看部署',
        ctaUrl: '/deploy',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    case 'deployment.wordpress_update_available':
      return {
        userId: event.userId,
        category: 'deployment',
        level: 'info',
        title: '有新的 WP 资产更新可用',
        body: '你的部署检测到了新的主题、插件或 GraphQL 资产版本，可以选择立即应用或稍后处理。',
        ctaLabel: '查看部署',
        ctaUrl: '/deploy',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    case 'deployment.action_requested': {
      const kind = normalizeString(properties.kind);
      const title =
        kind === 'apply_runtime_images'
          ? '前端更新已排队'
          : kind === 'apply_wordpress_assets'
            ? 'WP 资产更新已排队'
            : kind === 'ignore_runtime_images'
              ? '前端更新忽略已排队'
              : 'WP 资产忽略已排队';
      return {
        userId: event.userId,
        category: 'deployment',
        level: 'info',
        title,
        body: '服务器会在下一次轮询时执行这条部署动作。',
        ctaLabel: '查看部署',
        ctaUrl: '/deploy',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    }
    case 'deployment.action_completed': {
      const kind = normalizeString(properties.kind);
      const title =
        kind === 'apply_runtime_images'
          ? '前端更新已完成'
          : kind === 'apply_wordpress_assets'
            ? 'WP 资产更新已完成'
            : kind === 'ignore_runtime_images'
              ? '前端更新已忽略'
              : 'WP 资产更新已忽略';
      return {
        userId: event.userId,
        category: 'deployment',
        level: 'success',
        title,
        body: '服务器已经执行并完成了这条部署动作。',
        ctaLabel: '查看部署',
        ctaUrl: '/deploy',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    }
    case 'deployment.action_failed': {
      const kind = normalizeString(properties.kind);
      const title =
        kind === 'apply_runtime_images'
          ? '前端更新失败'
          : kind === 'apply_wordpress_assets'
            ? 'WP 资产更新失败'
            : kind === 'ignore_runtime_images'
              ? '前端更新忽略失败'
              : 'WP 资产更新忽略失败';
      const message = normalizeString(properties.message);
      return {
        userId: event.userId,
        category: 'deployment',
        level: 'error',
        title,
        body: message || '服务器在执行部署动作时失败，请检查部署详情和服务器日志。',
        ctaLabel: '查看部署',
        ctaUrl: '/deploy',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
      };
    }
    case 'ticket.created': {
      const ticketNo = normalizeString(properties.ticketNo) || '当前工单';
      const appCode = normalizeString(properties.appCode);
      return {
        userId: event.userId,
        category: 'ticket',
        level: 'info',
        title: '工单已创建',
        body: `${ticketNo} 已创建，我们会尽快处理。`,
        ctaLabel: '查看工单',
        ctaUrl: '/tickets',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
        meta: {
          ticketNo,
          ...(appCode ? { appCode } : {}),
        },
      };
    }
    case 'ticket.admin_replied': {
      const ticketNo = normalizeString(properties.ticketNo) || '当前工单';
      return {
        userId: event.userId,
        category: 'ticket',
        level: 'info',
        title: '工单有新回复',
        body: `${ticketNo} 已收到客服回复。`,
        ctaLabel: '查看工单',
        ctaUrl: '/tickets',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
        meta: {
          ticketNo,
        },
      };
    }
    case 'ticket.resolved': {
      const ticketNo = normalizeString(properties.ticketNo) || '当前工单';
      return {
        userId: event.userId,
        category: 'ticket',
        level: 'success',
        title: '工单已解决',
        body: `${ticketNo} 已标记为已解决。`,
        ctaLabel: '查看工单',
        ctaUrl: '/tickets',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
        meta: {
          ticketNo,
        },
      };
    }
    case 'ticket.closed': {
      const ticketNo = normalizeString(properties.ticketNo) || '当前工单';
      return {
        userId: event.userId,
        category: 'ticket',
        level: 'info',
        title: '工单已关闭',
        body: `${ticketNo} 已关闭。`,
        ctaLabel: '查看工单',
        ctaUrl: '/tickets',
        sourceEventId: event.id,
        sourceEventName: event.eventName,
        dedupeKey: `event:${event.id}`,
        meta: {
          ticketNo,
        },
      };
    }
    default:
      return null;
  }
}

export class NotificationsService {
  private readonly repository: NotificationsRepository;

  constructor(private readonly db: DbClient) {
    this.repository = new NotificationsRepository(db);
  }

  async projectFromEvents(events: EventProjectionInput[]) {
    for (const event of events) {
      const notification = buildNotificationFromEvent(event);
      if (!notification) {
        continue;
      }

      const existing = await this.repository.findByDedupeKey(notification.dedupeKey);
      if (existing) {
        continue;
      }

      await this.repository.insert({
        userId: notification.userId,
        category: notification.category,
        level: notification.level,
        title: notification.title,
        body: notification.body,
        ctaLabel: notification.ctaLabel ?? null,
        ctaUrl: notification.ctaUrl ?? null,
        status: 'unread',
        sourceEventId: notification.sourceEventId,
        sourceEventName: notification.sourceEventName,
        dedupeKey: notification.dedupeKey,
        meta: notification.meta ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  async listUserNotifications(query: {
    userId: string;
    limit: number;
    offset: number;
    status?: 'unread' | 'read' | 'archived';
    category?: NotificationCategory;
  }) {
    const result = await this.repository.listForUser(query);
    return {
      items: result.items,
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async listAdminNotifications(query: {
    limit: number;
    offset: number;
    search?: string;
    status?: 'unread' | 'read' | 'archived';
    category?: NotificationCategory;
  }) {
    const result = await this.repository.listForAdmin(query);
    return {
      items: result.items.map((item) => ({
        id: item.id,
        userId: item.userId,
        category: item.category,
        level: item.level,
        title: item.title,
        body: item.body,
        ctaLabel: item.ctaLabel,
        ctaUrl: item.ctaUrl,
        status: item.status,
        sourceEventId: item.sourceEventId,
        sourceEventName: item.sourceEventName,
        dedupeKey: item.dedupeKey,
        meta: item.meta,
        readAt: item.readAt,
        archivedAt: item.archivedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        user: item.userId
          ? {
              id: item.userId,
              email: item.userEmail ?? '',
              displayName: item.userDisplayName ?? null,
              status: item.userStatus ?? null,
            }
          : null,
      })),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async publishAnnouncement(
    input: {
      title: string;
      body: string;
      level: NotificationLevel;
      ctaLabel?: string;
      ctaUrl?: string;
    },
    actorUserId: string,
  ) {
    const recipients = await new AuthRepository(this.db).listActiveUsers();
    if (recipients.length === 0) {
      throw httpError(400, 'No active users available for announcement delivery');
    }

    const now = new Date();
    const broadcastId = randomUUID();

    await this.repository.insertMany(
      recipients.map((user) => ({
        userId: user.id,
        category: 'announcement',
        level: input.level,
        title: input.title,
        body: input.body,
        ctaLabel: input.ctaLabel ?? null,
        ctaUrl: input.ctaUrl ?? null,
        status: 'unread',
        sourceEventId: null,
        sourceEventName: 'admin.announcement_published',
        dedupeKey: `announcement:${broadcastId}:${user.id}`,
        meta: {
          broadcastId,
          actorUserId,
          audience: 'active_users',
        },
        createdAt: now,
        updatedAt: now,
      })),
    );

    return {
      broadcastId,
      recipientCount: recipients.length,
      title: input.title,
      level: input.level,
      createdAt: now,
    };
  }

  async getUnreadCount(userId: string) {
    return {
      unreadCount: await this.repository.countUnreadByUser(userId),
    };
  }

  async markAsRead(notificationId: string, userId: string) {
    const item = await this.repository.markAsRead(notificationId, userId);
    if (!item) {
      throw httpError(404, 'Notification not found');
    }
    return item;
  }

  async markAllAsRead(userId: string) {
    const items = await this.repository.markAllAsRead(userId);
    return {
      updatedCount: items.length,
    };
  }

  async archive(notificationId: string, userId: string) {
    const item = await this.repository.archive(notificationId, userId);
    if (!item) {
      throw httpError(404, 'Notification not found');
    }
    return item;
  }
}
