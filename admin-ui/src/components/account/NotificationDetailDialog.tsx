import { Link } from 'react-router-dom';

import type { NotificationItem, SupportTicketDetail, SupportTicketMessage } from '@/api/types';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, formatTime } from '@/lib/utils';

function notificationTone(level: NotificationItem['level']) {
  if (level === 'success') return 'ok' as const;
  if (level === 'warning') return 'warn' as const;
  if (level === 'error') return 'danger' as const;
  return 'info' as const;
}

function notificationCategoryLabel(category: NotificationItem['category']) {
  switch (category) {
    case 'account':
      return '账户';
    case 'announcement':
      return '公告';
    case 'billing':
      return '账单';
    case 'license':
      return '授权';
    case 'deployment':
      return '部署';
    case 'ticket':
      return '工单';
    case 'system':
    default:
      return '系统';
  }
}

function ticketStatusLabel(status: SupportTicketDetail['ticket']['status']) {
  switch (status) {
    case 'waiting_staff':
      return '待处理';
    case 'waiting_user':
      return '待回复';
    case 'resolved':
      return '已解决';
    case 'closed':
    default:
      return '已关闭';
  }
}

function ticketStatusTone(status: SupportTicketDetail['ticket']['status']) {
  switch (status) {
    case 'waiting_staff':
      return 'warn' as const;
    case 'waiting_user':
      return 'info' as const;
    case 'resolved':
      return 'ok' as const;
    case 'closed':
    default:
      return 'neutral' as const;
  }
}

function ticketPriorityLabel(priority: SupportTicketDetail['ticket']['priority']) {
  switch (priority) {
    case 'low':
      return '低';
    case 'normal':
      return '普通';
    case 'high':
      return '高';
    case 'urgent':
      return '紧急';
    default:
      return priority;
  }
}

function ticketPriorityTone(priority: SupportTicketDetail['ticket']['priority']) {
  switch (priority) {
    case 'urgent':
      return 'danger' as const;
    case 'high':
      return 'warn' as const;
    case 'low':
      return 'neutral' as const;
    case 'normal':
    default:
      return 'info' as const;
  }
}

function ticketMessageAuthorLabel(message: SupportTicketMessage) {
  if (message.authorType === 'system') {
    return '系统';
  }

  if (message.authorType === 'admin') {
    return message.author?.displayName?.trim() || message.author?.email || '客服';
  }

  return message.author?.displayName?.trim() || message.author?.email || '我';
}

function MetaField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/70 px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-sm text-foreground', mono && 'font-mono text-xs')}>
        {value || '—'}
      </p>
    </div>
  );
}

function TicketMessageList({ messages }: { messages: SupportTicketMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无会话记录。</p>;
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => {
        const isUser = message.authorType === 'user';
        return (
          <div key={message.id} className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[88%] rounded-xl border px-4 py-3 shadow-sm',
                isUser
                  ? 'border-blue-200 bg-blue-50 text-foreground'
                  : 'border-border bg-card text-foreground',
              )}
            >
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {ticketMessageAuthorLabel(message)}
                </span>
                <span>{formatTime(message.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm leading-6 whitespace-pre-wrap">{message.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function NotificationDetailDialog({
  notification,
  ticketDetail,
  isTicketLoading,
  ticketErrorMessage,
  onOpenChange,
}: {
  notification: NotificationItem | null;
  ticketDetail?: SupportTicketDetail;
  isTicketLoading?: boolean;
  ticketErrorMessage?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (!notification) {
    return null;
  }

  const isTicketNotification = notification.category === 'ticket';
  const shouldShowOpenButton = notification.category === 'ticket';
  const ctaLabel = shouldShowOpenButton ? '进入工单页处理' : (notification.ctaLabel ?? '');

  return (
    <Dialog open={Boolean(notification)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              tone={notificationTone(notification.level)}
              label={notificationCategoryLabel(notification.category)}
            />
            <p className="text-xs text-muted-foreground">{formatTime(notification.createdAt)}</p>
          </div>
          <DialogTitle className="mt-3 text-2xl tracking-tight">{notification.title}</DialogTitle>
          <DialogDescription className="mt-2 leading-6">
            在消息中心内先查看详情；如果需要继续处理，再决定是否进入相关页面。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-150px)]">
          <div className="space-y-5 px-6 py-5">
            {isTicketNotification ? (
              isTicketLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-10 animate-pulse rounded-lg bg-muted" />
                  ))}
                </div>
              ) : ticketDetail ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill
                      tone={ticketStatusTone(ticketDetail.ticket.status)}
                      label={ticketStatusLabel(ticketDetail.ticket.status)}
                    />
                    <StatusPill
                      tone={ticketPriorityTone(ticketDetail.ticket.priority)}
                      label={ticketPriorityLabel(ticketDetail.ticket.priority)}
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <MetaField label="工单号" value={ticketDetail.ticket.ticketNo} mono />
                    <MetaField label="应用" value={ticketDetail.ticket.app?.name ?? '未关联'} />
                    <MetaField
                      label="订单号"
                      value={ticketDetail.ticket.order?.orderNo ?? '未关联'}
                      mono
                    />
                    <MetaField
                      label="安装实例"
                      value={ticketDetail.ticket.install?.extensionInstallId ?? '未关联'}
                      mono
                    />
                    <MetaField
                      label="部署"
                      value={ticketDetail.ticket.deployment?.label ?? '未关联'}
                    />
                    <MetaField
                      label="最近活动"
                      value={formatTime(ticketDetail.ticket.lastActivityAt)}
                    />
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-foreground">会话记录</p>
                    <TicketMessageList messages={ticketDetail.messages} />
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-foreground">{notification.body}</p>
                  <p className="text-sm text-amber-700">
                    {ticketErrorMessage ||
                      '暂时无法加载关联工单详情，你仍然可以进入工单页继续处理。'}
                  </p>
                  <JsonViewer data={notification.meta} label="通知元数据" />
                </div>
              )
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
                  <p className="text-sm leading-7 whitespace-pre-wrap text-foreground">
                    {notification.body}
                  </p>
                </div>
                <JsonViewer data={notification.meta} label="通知元数据" />
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          {notification.ctaUrl && ctaLabel ? (
            notification.ctaUrl.startsWith('/') ? (
              <Button asChild>
                <Link to={notification.ctaUrl}>{ctaLabel}</Link>
              </Button>
            ) : (
              <Button asChild>
                <a href={notification.ctaUrl} target="_blank" rel="noreferrer">
                  {ctaLabel}
                </a>
              </Button>
            )
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
