import { useQueries } from '@tanstack/react-query';
import { ArrowUpRight, CreditCard, Package, ShieldCheck, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listOrders } from '@/api/admin';
import { listAppsAdmin } from '@/api/apps';
import { getPaymentSettings } from '@/api/payments';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { cn, formatAmount } from '@/lib/utils';

export function DashboardPage() {
  const results = useQueries({
    queries: [
      { queryKey: ['payment-settings'], queryFn: getPaymentSettings },
      { queryKey: ['orders', { limit: 50 }], queryFn: () => listOrders({ limit: 50 }) },
      { queryKey: ['apps'], queryFn: listAppsAdmin },
    ],
  });

  const [paymentsResult, ordersResult, appsResult] = results;
  const paymentData = paymentsResult.data;
  const orders = ordersResult.data?.items ?? [];
  const apps = appsResult.data?.items ?? [];

  const paidOrders = orders.filter((o) => o.status === 'paid');
  const pendingOrders = orders.filter((o) => ['pending', 'processing'].includes(o.status));
  const activeSecrets = apps
    .flatMap((a) => a.secrets ?? [])
    .filter((s) => !s.expiresAt || new Date(s.expiresAt) > new Date());

  const wechat = paymentData?.items.find((i) => i.code === 'wechat_pay');
  const alipay = paymentData?.items.find((i) => i.code === 'alipay');

  const quickLinks = [
    { label: '支付配置', href: '/admin/payments', icon: CreditCard },
    { label: '应用管理', href: '/admin/apps', icon: Package },
    { label: '授权管理', href: '/admin/licenses', icon: ShieldCheck },
    { label: '订单管理', href: '/admin/orders', icon: Zap },
  ];

  return (
    <div className="space-y-6 p-6">
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                to={link.href}
                className="border-border hover:border-foreground/20 bg-card group flex items-center justify-between gap-3 rounded-lg border p-3.5 no-underline transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="text-muted-foreground group-hover:text-foreground h-4 w-4 transition-colors" />
                  <p className="text-foreground text-[13px] font-medium">{link.label}</p>
                </div>
                <ArrowUpRight className="text-muted-foreground/60 group-hover:text-foreground h-3.5 w-3.5 transition-colors" />
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
              className="text-muted-foreground hover:text-foreground text-[12px] font-medium transition-colors"
            >
              查看全部 →
            </Link>
          </div>
          <div className="border-border bg-card overflow-hidden rounded-lg border">
            {orders.slice(0, 6).map((order, idx) => (
              <Link
                key={order.orderNo}
                to="/admin/orders"
                className={cn(
                  'hover:bg-muted/40 flex items-center justify-between gap-3 px-4 py-2.5 no-underline transition-colors',
                  idx > 0 && 'border-border border-t',
                )}
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate font-mono text-[12px] font-semibold">
                    {order.orderNo}
                  </p>
                  <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                    {order.user?.email ?? order.userId} · {order.app?.name ?? order.appId}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-foreground text-[13px] font-semibold tabular-nums">
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
    <h2 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.12em]">
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
    <div className="border-border bg-card rounded-lg border p-4">
      <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
        {label}
      </p>
      {loading ? (
        <div className="bg-muted mt-2 h-7 w-12 animate-pulse rounded" />
      ) : (
        <p
          className={cn(
            'mt-1.5 text-[28px] font-semibold tabular-nums leading-none tracking-tight',
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
      className="border-border hover:border-foreground/20 bg-card flex items-center justify-between gap-3 rounded-lg border p-4 no-underline transition-colors"
    >
      <div>
        <p className="text-foreground text-[13px] font-semibold">{name}</p>
        {loading ? (
          <div className="bg-muted mt-1 h-3 w-20 animate-pulse rounded" />
        ) : config ? (
          <p className="text-muted-foreground mt-0.5 text-[11px]">{config.source}</p>
        ) : (
          <p className="text-muted-foreground mt-0.5 text-[11px]">未配置</p>
        )}
      </div>
      {loading ? (
        <div className="bg-muted h-5 w-16 animate-pulse rounded-full" />
      ) : (
        <StatusPill
          tone={config?.configured ? 'ok' : 'neutral'}
          label={config?.configured ? '已配置' : '未配置'}
        />
      )}
    </Link>
  );
}
