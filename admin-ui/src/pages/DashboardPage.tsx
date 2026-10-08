import { useQueries } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Bell,
  Boxes,
  CreditCard,
  KeyRound,
  LifeBuoy,
  Package,
  Receipt,
  ShieldCheck,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { listAdminTickets, listOrders, listUsers } from '@/api/admin';
import { listAppsAdmin } from '@/api/apps';
import { getPaymentSettings } from '@/api/payments';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { cn, formatAmount, formatTime } from '@/lib/utils';

export function DashboardPage() {
  const results = useQueries({
    queries: [
      { queryKey: ['payment-settings'], queryFn: getPaymentSettings },
      { queryKey: ['orders', { limit: 50 }], queryFn: () => listOrders({ limit: 50 }) },
      { queryKey: ['apps'], queryFn: listAppsAdmin },
      {
        queryKey: ['dashboard-tickets'],
        queryFn: () => listAdminTickets({ status: 'waiting_staff', limit: 5 }),
        staleTime: 30_000,
      },
      {
        queryKey: ['dashboard-users'],
        queryFn: () => listUsers({ limit: 5 }),
        staleTime: 30_000,
      },
    ],
  });

  const [paymentsResult, ordersResult, appsResult, ticketsResult, usersResult] = results;
  const paymentData = paymentsResult.data;
  const orders = ordersResult.data?.items ?? [];
  const apps = appsResult.data?.items ?? [];
  const pendingTickets = ticketsResult.data?.items ?? [];
  const pendingTicketsTotal = ticketsResult.data?.total ?? 0;
  const allUsers = usersResult.data?.items ?? [];
  const unverifiedUsers = allUsers.filter((u) => !u.emailVerified);

  const paidOrders = orders.filter((o) => o.status === 'paid');
  const pendingOrders = orders.filter((o) => ['pending', 'processing'].includes(o.status));
  const activeSecrets = apps
    .flatMap((a) => a.secrets ?? [])
    .filter((s) => !s.expiresAt || new Date(s.expiresAt) > new Date());

  const wechat = paymentData?.items.find((i) => i.code === 'wechat_pay');
  const alipay = paymentData?.items.find((i) => i.code === 'alipay');
  const unconfiguredChannels = [
    wechat?.configured ? null : '微信支付',
    alipay?.configured ? null : '支付宝',
  ].filter(Boolean) as string[];

  const onboardingSteps = [
    {
      key: 'payments',
      title: '配置至少一个支付通道',
      description: '配置微信支付或支付宝，让用户能完成购买。',
      href: '/admin/payments',
      done: Boolean(wechat?.configured || alipay?.configured),
    },
    {
      key: 'apps',
      title: '创建第一个应用',
      description: '应用是授权和订单的载体，至少创建一个才能开始售卖。',
      href: '/admin/apps',
      done: apps.length > 0,
    },
    {
      key: 'content',
      title: '发布第一篇内容',
      description: '在内容中心写一篇教程或观点文章，让公开站点不空白。',
      href: '/admin/content',
      done: false, // 暂无内容数 query，先恒 false；用户可通过点 CTA 跳过
    },
  ];
  const showOnboarding =
    !appsResult.isLoading &&
    !paymentsResult.isLoading &&
    onboardingSteps.filter((s) => s.done).length < onboardingSteps.length &&
    (apps.length === 0 || (!wechat?.configured && !alipay?.configured));

  const todoItems = [
    pendingOrders.length > 0
      ? {
          key: 'orders',
          icon: Receipt,
          tone: 'warn' as const,
          title: `${pendingOrders.length} 笔订单待处理`,
          description: '待支付或处理中的订单可能需要补单同步',
          href: '/admin/orders',
        }
      : null,
    pendingTicketsTotal > 0
      ? {
          key: 'tickets',
          icon: LifeBuoy,
          tone: 'warn' as const,
          title: `${pendingTicketsTotal} 张工单待回复`,
          description: pendingTickets[0]?.subject
            ? `最近："${pendingTickets[0].subject.slice(0, 30)}"`
            : '用户已提交但未分配/未回复',
          href: '/admin/tickets',
        }
      : null,
    unconfiguredChannels.length > 0
      ? {
          key: 'channels',
          icon: Wallet,
          tone: 'info' as const,
          title: `${unconfiguredChannels.length} 个支付通道未配置`,
          description: unconfiguredChannels.join(' / '),
          href: '/admin/payments',
        }
      : null,
    unverifiedUsers.length > 0
      ? {
          key: 'users',
          icon: Users,
          tone: 'info' as const,
          title: `${unverifiedUsers.length} 个用户邮箱未验证`,
          description: '最近注册用户尚未完成邮箱验证',
          href: '/admin/users',
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    icon: typeof Receipt;
    tone: 'warn' | 'info';
    title: string;
    description: string;
    href: string;
  }>;

  const quickLinks = [
    { label: '支付配置', href: '/admin/payments', icon: CreditCard },
    { label: '应用管理', href: '/admin/apps', icon: Package },
    { label: '密钥管理', href: '/admin/secrets', icon: KeyRound },
    { label: '授权管理', href: '/admin/licenses', icon: ShieldCheck },
    { label: '订单管理', href: '/admin/orders', icon: Zap },
    { label: '工单管理', href: '/admin/tickets', icon: LifeBuoy },
    { label: '用户管理', href: '/admin/users', icon: Users },
    { label: '客户端安装', href: '/admin/installs', icon: Boxes },
    { label: '通知管理', href: '/admin/notifications', icon: Bell },
  ];

  return (
    <div className="space-y-6 p-6">
      {showOnboarding ? (
        <section className="rounded-xl border border-primary/20 bg-primary/[0.04] p-5 dark:bg-primary/[0.08]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                欢迎来到 fd-core-stack 后台
              </h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                完成下面 3 步即可让系统开始运转
              </p>
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {onboardingSteps.filter((s) => s.done).length} / {onboardingSteps.length} 已完成
            </span>
          </div>
          <ol className="space-y-2">
            {onboardingSteps.map((step, idx) => (
              <li
                key={step.key}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3',
                  step.done && 'opacity-60',
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                      step.done ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {step.done ? '✓' : idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-foreground">{step.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{step.description}</p>
                  </div>
                </div>
                {!step.done ? (
                  <Link
                    to={step.href}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground no-underline transition-colors hover:bg-primary/90"
                  >
                    去配置
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="接入应用" value={apps.length} loading={appsResult.isLoading} />
        <MetricCard label="活跃密钥" value={activeSecrets.length} loading={appsResult.isLoading} />
        <MetricCard label="已支付订单" value={paidOrders.length} loading={ordersResult.isLoading} />
        <MetricCard
          label="待处理订单"
          value={pendingOrders.length}
          loading={ordersResult.isLoading}
          alert={pendingOrders.length > 0}
        />
      </div>

      <section className="space-y-2.5">
        <SectionTitle title="待处理事项" />
        {todoItems.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground">
            <ShieldCheck className="text-emerald-500" />
            目前没有需要处理的事项
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {todoItems.map((item, idx) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  to={item.href}
                  className={cn(
                    'flex items-center justify-between gap-3 px-4 py-3 no-underline transition-colors hover:bg-muted/40',
                    idx > 0 && 'border-t border-border',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        item.tone === 'warn'
                          ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300'
                          : 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2.5">
        <SectionTitle title="支付通道" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <PaymentStatusCard
            name="微信支付"
            config={wechat}
            loading={paymentsResult.isLoading}
            href="/admin/payments"
          />
          <PaymentStatusCard
            name="支付宝"
            config={alipay}
            loading={paymentsResult.isLoading}
            href="/admin/payments"
          />
        </div>
      </section>

      <section className="space-y-2.5">
        <SectionTitle title="快捷入口" />
        <div className="flex flex-wrap gap-1.5">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                to={link.href}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-foreground no-underline transition-colors hover:bg-muted"
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
                {link.label}
              </Link>
            );
          })}
        </div>
      </section>

      {orders.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <SectionTitle title="最近订单" />
            <Link
              to="/admin/orders"
              className="text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              查看全部 →
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {orders.slice(0, 6).map((order, idx) => (
              <Link
                key={order.orderNo}
                to="/admin/orders"
                className={cn(
                  'flex items-center justify-between gap-3 px-4 py-2.5 no-underline transition-colors hover:bg-muted/40',
                  idx > 0 && 'border-t border-border',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-[12px] font-semibold text-foreground">
                    {order.orderNo}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {order.user?.email ?? order.userId} · {order.app?.name ?? order.appId} ·{' '}
                    {formatTime(order.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-[13px] font-semibold text-foreground tabular-nums">
                    {formatAmount(order.amount, order.currency)}
                  </span>
                  <StatusPill tone={statusToTone(order.status)} label={order.status} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
      {title}
    </h2>
  );
}

function MetricCard({
  label,
  value,
  loading,
  alert,
}: {
  label: string;
  value: number;
  loading?: boolean;
  alert?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      {loading ? (
        <div className="mt-2 h-7 w-12 animate-pulse rounded bg-muted" />
      ) : (
        <p
          className={cn(
            'mt-1.5 text-[28px] leading-none font-semibold tracking-tight tabular-nums',
            alert ? 'text-amber-600 dark:text-amber-400' : 'text-foreground',
          )}
        >
          {value}
        </p>
      )}
    </div>
  );
}

function PaymentStatusCard({
  name,
  config,
  loading,
  href,
}: {
  name: string;
  config: { configured: boolean; source: string } | undefined;
  loading?: boolean;
  href: string;
}) {
  return (
    <Link
      to={href}
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 no-underline transition-colors hover:border-foreground/20"
    >
      <div>
        <p className="text-[13px] font-semibold text-foreground">{name}</p>
        {loading ? (
          <div className="mt-1 h-3 w-20 animate-pulse rounded bg-muted" />
        ) : config ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{config.source}</p>
        ) : (
          <p className="mt-0.5 text-[11px] text-muted-foreground">未配置</p>
        )}
      </div>
      {loading ? (
        <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
      ) : (
        <StatusPill
          tone={config?.configured ? 'ok' : 'neutral'}
          label={config?.configured ? '已配置' : '未配置'}
        />
      )}
    </Link>
  );
}
