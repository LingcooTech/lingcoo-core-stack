import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, FileSearch, KeyRound, LoaderCircle, UserCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { listApps } from '@/api/apps';
import { changePassword, forgotPassword, getCurrentUser, updateCurrentUser } from '@/api/auth';
import type {
  HydratedEntitlement,
  NotificationItem,
  NotificationUnreadCount,
  NotificationsResponse,
} from '@/api/types';
import {
  archiveNotification,
  getMyTicket,
  listMyEntitlements,
  listMyNotifications,
  listMyOrders,
  markAllNotificationsRead,
  markNotificationRead,
  syncMyOrder,
} from '@/api/user';
import { NotificationDetailDialog } from '@/components/account/NotificationDetailDialog';
import { AccountTicketsTab } from '@/components/account/AccountTicketsTab';
import { EmptyState } from '@/components/portal/EmptyState';
import { EntitlementProductCard } from '@/components/portal/EntitlementProductCard';
import { OrderCard } from '@/components/portal/OrderCard';
import { StatusPill } from '@/components/shared/StatusPill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAppDeliveryMode } from '@/lib/app-delivery';
import { getAccessLinks } from '@/lib/app-catalog-ui';
import { cn, formatAmount, formatTime } from '@/lib/utils';

const accountTabValues = ['profile', 'notifications', 'orders', 'apps', 'tickets'] as const;
type AccountTab = (typeof accountTabValues)[number];

const profileSchema = z.object({
  displayName: z.string().trim().max(120, '用户名不能超过 120 个字符'),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(8, '请输入当前密码'),
    newPassword: z.string().min(8, '新密码至少 8 位'),
    confirmPassword: z.string().min(8, '请再次输入新密码'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的新密码不一致',
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: '新密码不能与当前密码相同',
  });

type ProfileValues = z.infer<typeof profileSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

function isEffectiveEntitlement(item: HydratedEntitlement) {
  if (item.status !== 'active') {
    return false;
  }
  if (!item.expiresAt) {
    return true;
  }
  return new Date(item.expiresAt).getTime() >= Date.now();
}

function normalizeAccountTab(value: string | null): AccountTab {
  return accountTabValues.includes(value as AccountTab) ? (value as AccountTab) : 'profile';
}

function AccountProfileTab() {
  const qc = useQueryClient();
  const currentUserQuery = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
  });
  const currentUser = currentUserQuery.data?.user ?? null;

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: '',
    },
  });

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    profileForm.reset({
      displayName: currentUser.displayName ?? '',
    });
  }, [currentUser, profileForm]);

  const updateProfileMutation = useMutation({
    mutationFn: (values: ProfileValues) => updateCurrentUser(values.displayName),
    onSuccess: (result) => {
      toast.success('个人资料已更新');
      qc.setQueryData(['current-user'], {
        authenticated: true,
        user: result.user,
      });
      profileForm.reset({
        displayName: result.user.displayName ?? '',
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '更新个人资料失败'),
  });

  const changePasswordMutation = useMutation({
    mutationFn: (values: PasswordValues) =>
      changePassword(values.currentPassword, values.newPassword, values.confirmPassword),
    onSuccess: () => {
      toast.success('密码已修改');
      passwordForm.reset();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '修改密码失败'),
  });

  const sendResetEmailMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser?.email) {
        throw new Error('当前用户邮箱不可用');
      }

      return forgotPassword(currentUser.email);
    },
    onSuccess: () => {
      toast.success('找回密码邮件已发送，请检查邮箱');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '发送找回密码邮件失败'),
  });

  if (currentUserQuery.isLoading) {
    return (
      <Card className="border-border bg-card rounded-xl">
        <CardContent className="text-muted-foreground flex items-center justify-center gap-3 p-10">
          <LoaderCircle className="text-primary h-6 w-6 animate-spin" />
          正在加载个人资料...
        </CardContent>
      </Card>
    );
  }

  if (!currentUser) {
    return (
      <EmptyState
        icon={UserCircle2}
        title="无法加载个人资料"
        description="当前用户资料暂时不可用，请刷新页面后重试。"
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="border-border bg-card rounded-xl border px-4 py-3.5 shadow-sm">
          <p className="text-muted-foreground text-sm font-medium">登录邮箱</p>
          <p className="text-foreground mt-2 break-all text-sm font-semibold">
            {currentUser.email}
          </p>
        </div>
        <div className="border-border bg-card rounded-xl border px-4 py-3.5 shadow-sm">
          <p className="text-muted-foreground text-sm font-medium">账户角色</p>
          <p className="text-foreground mt-2 text-sm font-semibold">
            {currentUser.role === 'admin' ? '管理员' : '普通用户'}
          </p>
        </div>
        <div className="border-border bg-card rounded-xl border px-4 py-3.5 shadow-sm">
          <p className="text-muted-foreground text-sm font-medium">邮箱验证</p>
          <div className="mt-2">
            <Badge variant={currentUser.emailVerified ? 'default' : 'secondary'}>
              {currentUser.emailVerified ? '已验证' : '待验证'}
            </Badge>
          </div>
        </div>
      </div>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="border-border bg-card rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl tracking-tight">个人资料</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...profileForm}>
              <form
                onSubmit={profileForm.handleSubmit((values) =>
                  updateProfileMutation.mutate(values),
                )}
                className="space-y-5"
              >
                <FormField
                  control={profileForm.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>用户名</FormLabel>
                      <FormControl>
                        <Input placeholder="请输入用户名" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={updateProfileMutation.isPending}>
                  {updateProfileMutation.isPending ? '保存中...' : '保存个人资料'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="border-border bg-card rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl tracking-tight">密码与安全</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Form {...passwordForm}>
              <form
                onSubmit={passwordForm.handleSubmit((values) =>
                  changePasswordMutation.mutate(values),
                )}
                className="space-y-5"
              >
                <FormField
                  control={passwordForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>当前密码</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>新密码</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>确认新密码</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={changePasswordMutation.isPending}>
                  {changePasswordMutation.isPending ? '修改中...' : '修改密码'}
                </Button>
              </form>
            </Form>

            <div className="border-border bg-muted/70 rounded-lg border border-dashed p-4">
              <p className="text-foreground text-sm font-semibold">忘记当前密码？</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                disabled={sendResetEmailMutation.isPending}
                onClick={() => sendResetEmailMutation.mutate()}
              >
                {sendResetEmailMutation.isPending ? '发送中...' : '发送找回密码邮件'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function AccountOrdersTab() {
  const qc = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ['my-orders'], queryFn: listMyOrders });
  const syncMutation = useMutation({
    mutationFn: syncMyOrder,
    onSuccess: () => {
      toast.success('订单状态已同步');
      void qc.invalidateQueries({ queryKey: ['my-orders'] });
      void qc.invalidateQueries({ queryKey: ['my-entitlements'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '同步失败');
    },
  });

  const orders = ordersQuery.data?.items ?? [];
  const paidOrders = orders.filter((order) => order.status === 'paid');
  const pendingOrders = orders.filter((order) => order.status !== 'paid');

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: '全部订单', value: String(orders.length) },
          { label: '已支付', value: String(paidOrders.length) },
          { label: '待同步', value: String(pendingOrders.length) },
        ].map((item) => (
          <div
            key={item.label}
            className="border-border bg-card rounded-xl border px-4 py-3.5 shadow-sm"
          >
            <p className="text-muted-foreground text-sm font-medium">{item.label}</p>
            <p className="text-foreground mt-1.5 text-[1.75rem] font-semibold tracking-tight">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-foreground text-2xl font-semibold tracking-tight">我的订单</h2>
          <p className="text-muted-foreground text-sm">
            已支付 {paidOrders.length} 笔，累计{' '}
            {formatAmount(
              paidOrders.reduce((sum, order) => sum + order.amount, 0),
              paidOrders[0]?.currency ?? 'CNY',
            )}
          </p>
        </div>

        <div className="grid gap-4">
          {ordersQuery.isLoading ? (
            <Card className="border-border bg-card rounded-xl">
              <CardContent className="text-muted-foreground flex items-center justify-center gap-3 p-10">
                <LoaderCircle className="text-primary h-6 w-6 animate-spin" />
                正在加载订单记录...
              </CardContent>
            </Card>
          ) : orders.length === 0 ? (
            <EmptyState
              icon={FileSearch}
              title="还没有订单记录"
              description="还没有订单记录，去应用中心看看吧。"
            />
          ) : (
            orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onSync={(orderNo) => syncMutation.mutate(orderNo)}
                syncing={syncMutation.isPending}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function notificationTone(level: 'info' | 'success' | 'warning' | 'error') {
  if (level === 'success') return 'ok' as const;
  if (level === 'warning') return 'warn' as const;
  if (level === 'error') return 'danger' as const;
  return 'info' as const;
}

function notificationCategoryLabel(
  category: 'account' | 'billing' | 'license' | 'deployment' | 'ticket' | 'system' | 'announcement',
) {
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

function extractNotificationTicketNo(item: NotificationItem) {
  const ticketNo = item.meta?.ticketNo;
  if (typeof ticketNo === 'string' && ticketNo.trim()) {
    return ticketNo.trim();
  }

  const matched = `${item.title}\n${item.body}`.match(/\bTK-\d{8}-[A-Z0-9]{6}\b/);
  return matched?.[0] ?? null;
}

function AccountNotificationsTab() {
  const qc = useQueryClient();
  const notificationsQueryKey = ['my-notifications', { limit: 100 }] as const;
  const unreadCountQueryKey = ['my-notifications', 'unread-count'] as const;
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);
  const notificationsQuery = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: () => listMyNotifications({ limit: 100 }),
  });
  const selectedTicketNo =
    selectedNotification?.category === 'ticket'
      ? extractNotificationTicketNo(selectedNotification)
      : null;
  const ticketDetailQuery = useQuery({
    queryKey: ['notification-ticket-detail', selectedTicketNo],
    queryFn: () => getMyTicket(selectedTicketNo!),
    enabled: Boolean(selectedTicketNo),
  });

  const notifications = notificationsQuery.data?.items ?? [];
  const unreadCount = notifications.filter((item) => item.status === 'unread').length;

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onMutate: async (notificationId) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: notificationsQueryKey }),
        qc.cancelQueries({ queryKey: unreadCountQueryKey }),
      ]);

      const previousNotifications = qc.getQueryData<NotificationsResponse>(notificationsQueryKey);
      const previousUnreadCount = qc.getQueryData<NotificationUnreadCount>(unreadCountQueryKey);
      const target =
        previousNotifications?.items.find((item) => item.id === notificationId) ?? null;

      if (target?.status === 'unread') {
        const now = new Date().toISOString();

        qc.setQueryData<NotificationsResponse>(notificationsQueryKey, (current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            items: current.items.map((item) =>
              item.id === notificationId
                ? {
                    ...item,
                    status: 'read',
                    readAt: now,
                    updatedAt: now,
                  }
                : item,
            ),
          };
        });

        qc.setQueryData<NotificationUnreadCount>(unreadCountQueryKey, (current) =>
          current
            ? {
                unreadCount: Math.max(0, current.unreadCount - 1),
              }
            : current,
        );

        setSelectedNotification((current) =>
          current?.id === notificationId
            ? {
                ...current,
                status: 'read',
                readAt: now,
                updatedAt: now,
              }
            : current,
        );
      }

      return {
        previousNotifications,
        previousUnreadCount,
      };
    },
    onSuccess: async (result) => {
      setSelectedNotification((current) => (current?.id === result.id ? result : current));
      await Promise.all([
        qc.invalidateQueries({ queryKey: notificationsQueryKey }),
        qc.invalidateQueries({ queryKey: unreadCountQueryKey }),
      ]);
    },
    onError: (err, _variables, context) => {
      if (context?.previousNotifications) {
        qc.setQueryData(notificationsQueryKey, context.previousNotifications);
      }
      if (context?.previousUnreadCount) {
        qc.setQueryData(unreadCountQueryKey, context.previousUnreadCount);
      }
      toast.error(err instanceof Error ? err.message : '标记已读失败');
    },
    onSettled: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: notificationsQueryKey }),
        qc.invalidateQueries({ queryKey: unreadCountQueryKey }),
      ]);
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async (result) => {
      toast.success(`已标记 ${result.updatedCount} 条通知为已读`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: notificationsQueryKey }),
        qc.invalidateQueries({ queryKey: unreadCountQueryKey }),
      ]);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '全部已读失败'),
  });

  const archiveMutation = useMutation({
    mutationFn: archiveNotification,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: notificationsQueryKey }),
        qc.invalidateQueries({ queryKey: unreadCountQueryKey }),
      ]);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '归档通知失败'),
  });

  const openNotificationDetail = (item: NotificationItem) => {
    setSelectedNotification(item);
    if (item.status === 'unread') {
      markReadMutation.mutate(item.id);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: '全部通知', value: String(notifications.length) },
          { label: '未读', value: String(unreadCount) },
          {
            label: '已归档',
            value: String(notifications.filter((item) => item.status === 'archived').length),
          },
        ].map((item) => (
          <div
            key={item.label}
            className="border-border bg-card rounded-xl border px-4 py-3.5 shadow-sm"
          >
            <p className="text-muted-foreground text-sm font-medium">{item.label}</p>
            <p className="text-foreground mt-1.5 text-[1.75rem] font-semibold tracking-tight">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-foreground text-2xl font-semibold tracking-tight">消息通知</h2>
            <p className="text-muted-foreground text-sm">
              集中查看与你的账户、订单、授权和部署相关的系统通知。
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending || unreadCount === 0}
          >
            全部标记已读
          </Button>
        </div>

        {notificationsQuery.isLoading ? (
          <Card className="border-border bg-card rounded-xl">
            <CardContent className="text-muted-foreground flex items-center justify-center gap-3 p-10">
              <LoaderCircle className="text-primary h-6 w-6 animate-spin" />
              正在加载通知...
            </CardContent>
          </Card>
        ) : notifications.length === 0 ? (
          <EmptyState icon={Bell} title="暂无通知" description="当前还没有与你相关的系统通知。" />
        ) : (
          <div className="space-y-3">
            {notifications.map((item) => (
              <Card
                key={item.id}
                className={cn(
                  'border-border bg-card rounded-xl shadow-sm transition',
                  item.status === 'unread' ? 'border-sky-200 bg-sky-50/30' : '',
                )}
              >
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.status === 'unread' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                            <BellRing className="h-3 w-3" />
                            未读
                          </span>
                        ) : null}
                        <StatusPill
                          tone={notificationTone(item.level)}
                          label={notificationCategoryLabel(item.category)}
                        />
                      </div>
                      <div>
                        <p className="text-foreground text-base font-semibold">{item.title}</p>
                        <p className="text-muted-foreground mt-1 text-sm leading-6">{item.body}</p>
                      </div>
                    </div>
                    <p className="text-muted-foreground text-xs">{formatTime(item.createdAt)}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openNotificationDetail(item)}
                    >
                      查看详情
                    </Button>
                    {item.status !== 'archived' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => archiveMutation.mutate(item.id)}
                        disabled={archiveMutation.isPending}
                      >
                        归档
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <NotificationDetailDialog
          notification={selectedNotification}
          ticketDetail={ticketDetailQuery.data}
          isTicketLoading={ticketDetailQuery.isLoading}
          ticketErrorMessage={
            ticketDetailQuery.error instanceof Error ? ticketDetailQuery.error.message : null
          }
          onOpenChange={(open) => {
            if (!open) {
              setSelectedNotification(null);
            }
          }}
        />
      </section>
    </div>
  );
}

function AccountAppsTab() {
  const entitlementsQuery = useQuery({
    queryKey: ['my-entitlements'],
    queryFn: listMyEntitlements,
  });
  const appsQuery = useQuery({ queryKey: ['public-apps'], queryFn: listApps });

  const summary = entitlementsQuery.data?.summary ?? [];
  const items = entitlementsQuery.data?.items ?? [];
  const apps = appsQuery.data?.items ?? [];
  const appByCode = new Map(apps.map((app) => [app.code, app]));

  const appsByProduct = new Map<string, string[]>();
  for (const app of apps) {
    if (!appsByProduct.has(app.code)) {
      appsByProduct.set(app.code, []);
    }
    appsByProduct.get(app.code)?.push(app.name);
  }

  const featureNameMap = new Map<string, string>();
  for (const item of items) {
    if (item.plan?.code && item.plan?.name) {
      featureNameMap.set(item.plan.code, item.plan.name);
    }
  }

  const activeItems = items.filter(isEffectiveEntitlement);
  const inactiveItems = items.filter((item) => !isEffectiveEntitlement(item));
  const deployableCount = summary.filter((entry) => {
    const app = appByCode.get(entry.appCode);
    return Boolean(app && getAppDeliveryMode(app) === 'one_click');
  }).length;
  const appCodes = Array.from(
    new Set([
      ...summary.map((entry) => entry.appCode),
      ...items.map((item) => item.app?.code).filter((code): code is string => Boolean(code)),
    ]),
  );
  const activeSummaryMap = new Map(summary.map((entry) => [entry.appCode, entry]));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '已购应用', value: String(summary.length) },
          { label: '激活授权', value: String(activeItems.length) },
          { label: '可部署应用', value: String(deployableCount) },
          { label: '失效/撤销', value: String(inactiveItems.length) },
        ].map((item) => (
          <div
            key={item.label}
            className="border-border bg-card rounded-xl border px-4 py-3.5 shadow-sm"
          >
            <p className="text-muted-foreground text-sm font-medium">{item.label}</p>
            <p className="text-foreground mt-1.5 text-[1.75rem] font-semibold tracking-tight">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {entitlementsQuery.isLoading ? (
        <Card className="border-border bg-card rounded-xl">
          <CardContent className="text-muted-foreground flex items-center justify-center gap-3 p-10">
            <LoaderCircle className="text-primary h-6 w-6 animate-spin" />
            正在加载已购应用...
          </CardContent>
        </Card>
      ) : appCodes.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="还没有已购应用"
          description="还没有已购应用，去应用中心选购吧。"
        />
      ) : (
        <section className="space-y-5">
          <h2 className="text-foreground text-2xl font-semibold tracking-tight">我的应用</h2>
          <div className="grid gap-5 lg:grid-cols-2">
            {appCodes.map((appCode) => {
              const entry = activeSummaryMap.get(appCode) ?? null;
              const relatedItems = items.filter((item) => item.app?.code === appCode);
              const activeRelatedItems = relatedItems.filter(isEffectiveEntitlement);
              const relatedApps = appsByProduct.get(appCode) ?? [];
              const app = appByCode.get(appCode) ?? null;
              const fallbackFeatureNames = Array.from(
                new Set(
                  relatedItems
                    .map((item) => item.plan?.name ?? item.plan?.code ?? '')
                    .filter(Boolean),
                ),
              );
              const featureNames =
                entry?.featureCodes.map((code) => featureNameMap.get(code) ?? code) ??
                fallbackFeatureNames;
              const deploymentHref =
                activeRelatedItems.length > 0 && app && getAppDeliveryMode(app) === 'one_click'
                  ? `/deploy?app=${encodeURIComponent(appCode)}`
                  : undefined;
              const accessLinks =
                activeRelatedItems.length > 0 && app && getAppDeliveryMode(app) !== 'one_click'
                  ? getAccessLinks(app.links)
                  : [];

              return (
                <EntitlementProductCard
                  key={appCode}
                  productName={relatedItems[0]?.app?.name ?? app?.name ?? appCode}
                  featureNames={featureNames}
                  relatedApps={relatedApps}
                  items={relatedItems}
                  deploymentHref={deploymentHref}
                  accessLinks={accessLinks}
                  appHref={`/apps/${appCode}`}
                  accessState={activeRelatedItems.length > 0 ? 'active' : 'inactive'}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export function AccountCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = normalizeAccountTab(searchParams.get('tab'));

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">个人中心</h1>
      </div>

      <Tabs
        value={currentTab}
        onValueChange={(nextValue) => setSearchParams({ tab: normalizeAccountTab(nextValue) })}
        className="space-y-5"
      >
        <div className="border-border bg-card rounded-xl border px-4 py-3.5 shadow-sm">
          <TabsList className="bg-muted/70 h-auto w-full justify-start gap-1 rounded-lg p-1">
            <TabsTrigger value="profile" className="min-w-[108px] rounded-md">
              个人资料
            </TabsTrigger>
            <TabsTrigger value="notifications" className="min-w-[108px] rounded-md">
              消息通知
            </TabsTrigger>
            <TabsTrigger value="orders" className="min-w-[108px] rounded-md">
              我的订单
            </TabsTrigger>
            <TabsTrigger value="apps" className="min-w-[108px] rounded-md">
              我的应用
            </TabsTrigger>
            <TabsTrigger value="tickets" className="min-w-[108px] rounded-md">
              我的工单
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profile" className="mt-0">
          <AccountProfileTab />
        </TabsContent>
        <TabsContent value="notifications" className="mt-0">
          <AccountNotificationsTab />
        </TabsContent>
        <TabsContent value="orders" className="mt-0">
          <AccountOrdersTab />
        </TabsContent>
        <TabsContent value="apps" className="mt-0">
          <AccountAppsTab />
        </TabsContent>
        <TabsContent value="tickets" className="mt-0">
          <AccountTicketsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
