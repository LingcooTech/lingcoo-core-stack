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
      { queryKey: ['orders', 50], queryFn: () => listOrders(50) },
      { queryKey: ['apps'], queryFn: listAppsAdmin }
    ]
  });

  const [paymentsResult, ordersResult, appsResult] = results;
  const paymentData = paymentsResult.data;
  const orders = ordersResult.data?.items ?? [];
  const apps = appsResult.data?.items ?? [];

  const paidOrders = orders.filter((o) => o.status === 'paid');
  const pendingOrders = orders.filter((o) => ['pending', 'processing'].includes(o.status));
  const activeSecrets = apps.flatMap((a) => a.secrets ?? []).filter((s) => !s.expiresAt || new Date(s.expiresAt) > new Date());

  const wechat = paymentData?.items.find((i) => i.code === 'wechat_pay');
  const alipay = paymentData?.items.find((i) => i.code === 'alipay');

  const quickLinks = [
    { label: '支付配置', desc: '微信 / 支付宝通道', href: '/admin/payments', icon: CreditCard, color: 'text-blue-600 bg-blue-50' },
    { label: '应用接入', desc: '注册应用 + Secret', href: '/admin/apps', icon: Package, color: 'text-violet-600 bg-violet-50' },
    { label: '授权管理', desc: '发放 / 撤销授权', href: '/admin/licenses', icon: ShieldCheck, color: 'text-green-600 bg-green-50' },
    { label: '运营台', desc: '订单 + 安装实例', href: '/admin/operations', icon: Zap, color: 'text-amber-600 bg-amber-50' }
  ];

  return (
    <div>
      <SectionHeader sectionKey="dashboard" />
      <div className="p-6 space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="接入应用" value={apps.length} sublabel="应用总数" loading={appsResult.isLoading} />
          <MetricCard label="活跃 Secret" value={activeSecrets.length} sublabel="有效密钥" loading={appsResult.isLoading} />
          <MetricCard label="已支付订单" value={paidOrders.length} sublabel={`最近 ${orders.length} 条`} loading={ordersResult.isLoading} />
          <MetricCard label="待处理订单" value={pendingOrders.length} sublabel="pending / processing" loading={ordersResult.isLoading} tone={pendingOrders.length > 0 ? 'warn' : 'ok'} />
        </div>

        {/* Payment Status */}
        <div>
          <h2 className="text-sm font-black text-muted-foreground uppercase tracking-wider mb-3">支付通道状态</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {/* Quick Links */}
        <div>
          <h2 className="text-sm font-black text-muted-foreground uppercase tracking-wider mb-3">快速入口</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className="group flex flex-col gap-3 p-4 rounded-2xl border border-border bg-white hover:border-primary/30 hover:shadow-sm transition-all no-underline"
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${link.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-foreground">{link.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{link.desc}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent Orders */}
        {orders.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-muted-foreground uppercase tracking-wider">最近订单</h2>
              <Link to="/admin/operations" className="text-xs font-bold text-primary hover:underline">
                查看全部 →
              </Link>
            </div>
            <div className="rounded-2xl border border-border bg-white overflow-hidden">
              {orders.slice(0, 5).map((order, idx) => (
                <div
                  key={order.orderNo}
                  className={`flex items-center justify-between gap-3 px-4 py-3 ${idx > 0 ? 'border-t border-border' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold font-mono text-foreground truncate">{order.orderNo}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {order.user?.email ?? order.userId} · {order.product?.name ?? order.productId}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-bold">{formatAmount(order.amount, order.currency)}</span>
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
  sublabel,
  loading,
  tone = 'neutral'
}: {
  label: string;
  value: number;
  sublabel: string;
  loading?: boolean;
  tone?: 'ok' | 'warn' | 'neutral';
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-black uppercase tracking-wider text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-16 rounded bg-muted animate-pulse" />
        ) : (
          <>
            <p
              className={`text-2xl font-black tracking-tight ${
                tone === 'warn' && value > 0 ? 'text-amber-600' : 'text-foreground'
              }`}
            >
              {value}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentStatusCard({
  name,
  config,
  loading,
  href
}: {
  name: string;
  config: { configured: boolean; source: string } | undefined;
  loading?: boolean;
  href: string;
}) {
  return (
    <Link
      to={href}
      className="flex items-center justify-between gap-3 p-4 rounded-2xl border border-border bg-white hover:border-primary/30 transition-colors no-underline"
    >
      <div>
        <p className="text-sm font-black text-foreground">{name}</p>
        {loading ? (
          <div className="h-3 w-20 mt-1 rounded bg-muted animate-pulse" />
        ) : config ? (
          <p className="text-xs text-muted-foreground mt-0.5">来源: {config.source}</p>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">未找到配置</p>
        )}
      </div>
      {loading ? (
        <div className="h-6 w-16 rounded-full bg-muted animate-pulse" />
      ) : (
        <StatusPill
          tone={config?.configured ? 'ok' : 'neutral'}
          label={config?.configured ? '已配置' : '未配置'}
        />
      )}
    </Link>
  );
}
