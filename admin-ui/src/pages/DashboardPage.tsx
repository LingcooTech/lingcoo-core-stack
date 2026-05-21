import { useQueries } from '@tanstack/react-query';
import { ArrowRight, CreditCard, Package, ShieldCheck, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listOrders } from '@/api/admin';
import { listAppsAdmin } from '@/api/apps';
import { getPaymentSettings } from '@/api/payments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { formatAmount } from '@/lib/utils';

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
    {
      label: '支付配置',
      href: '/admin/payments',
      icon: CreditCard,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: '应用管理',
      href: '/admin/apps',
      icon: Package,
      color: 'text-violet-600 bg-violet-50',
    },
    {
      label: '授权管理',
      href: '/admin/licenses',
      icon: ShieldCheck,
      color: 'text-green-600 bg-green-50',
    },
    { label: '订单管理', href: '/admin/orders', icon: Zap, color: 'text-amber-600 bg-amber-50' },
  ];

  return (
    <div>
      <SectionHeader sectionKey="dashboard" />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard
            label="接入应用"
            value={apps.length}
            loading={appsResult.isLoading}
            color="from-blue-500 to-blue-600"
          />
          <MetricCard
            label="活跃密钥"
            value={activeSecrets.length}
            loading={appsResult.isLoading}
            color="from-green-500 to-green-600"
          />
          <MetricCard
            label="已支付订单"
            value={paidOrders.length}
            loading={ordersResult.isLoading}
            color="from-purple-500 to-purple-600"
          />
          <MetricCard
            label="待处理订单"
            value={pendingOrders.length}
            loading={ordersResult.isLoading}
            tone={pendingOrders.length > 0 ? 'warn' : 'ok'}
            color="from-amber-500 to-amber-600"
          />
        </div>

        <div>
          <h2 className="text-foreground mb-3 text-base font-semibold">支付通道</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
        </div>

        <div>
          <h2 className="text-foreground mb-3 text-base font-semibold">快捷入口</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className="border-border hover:border-primary/30 bg-card group flex flex-col gap-3 rounded-xl border p-4 no-underline transition-all duration-300"
                >
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${link.color} transition-transform duration-300`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-foreground text-sm font-semibold">{link.label}</p>
                  <ArrowRight className="text-muted-foreground group-hover:text-primary h-4 w-4 transition-all duration-300 group-hover:translate-x-1" />
                </Link>
              );
            })}
          </div>
        </div>

        {orders.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-foreground text-base font-semibold">最近订单</h2>
              <Link to="/admin/orders" className="text-primary text-xs font-bold hover:underline">
                查看全部 →
              </Link>
            </div>
            <div className="border-border bg-card overflow-hidden rounded-xl border">
              {orders.slice(0, 5).map((order, idx) => (
                <div
                  key={order.orderNo}
                  className={`flex items-center justify-between gap-3 px-4 py-3 ${idx > 0 ? 'border-border border-t' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="text-foreground truncate font-mono text-xs font-bold">
                      {order.orderNo}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {order.user?.email ?? order.userId} · {order.app?.name ?? order.appId}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs font-bold">
                      {formatAmount(order.amount, order.currency)}
                    </span>
                    <StatusPill tone={statusToTone(order.status)} label={order.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  loading,
  tone = 'neutral',
  color = 'from-gray-500 to-gray-600',
}: {
  label: string;
  value: number;
  loading?: boolean;
  tone?: 'ok' | 'warn' | 'neutral';
  color?: string;
}) {
  return (
    <Card className="transition-colors">
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="bg-muted h-8 w-16 animate-pulse rounded" />
        ) : (
          <div className="flex items-center justify-between">
            <p
              className={`text-2xl font-semibold tracking-tight ${
                tone === 'warn' && value > 0 ? 'text-amber-600' : 'text-foreground'
              }`}
            >
              {value}
            </p>
            <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${color} opacity-10`} />
          </div>
        )}
      </CardContent>
    </Card>
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
      className="border-border hover:border-primary/30 bg-card flex items-center justify-between gap-3 rounded-xl border p-4 no-underline transition-colors"
    >
      <div>
        <p className="text-foreground text-sm font-semibold">{name}</p>
        {loading ? (
          <div className="bg-muted mt-1 h-3 w-20 animate-pulse rounded" />
        ) : config ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{config.source}</p>
        ) : (
          <p className="text-muted-foreground mt-0.5 text-xs">未配置</p>
        )}
      </div>
      {loading ? (
        <div className="bg-muted h-6 w-16 animate-pulse rounded-full" />
      ) : (
        <StatusPill
          tone={config?.configured ? 'ok' : 'neutral'}
          label={config?.configured ? '已配置' : '未配置'}
        />
      )}
    </Link>
  );
}
