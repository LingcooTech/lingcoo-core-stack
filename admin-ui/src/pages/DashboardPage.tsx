import { useQueries } from '@tanstack/react-query';
import { Alert, Button, Card, Descriptions, Space, Statistic, Table, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { listAdminTickets, listContent, listOrders, listUsers } from '@/api/admin';
import { listAppsAdmin } from '@/api/apps';
import { getPaymentSettings } from '@/api/payments';
import { PageContainer } from '@/components/admin/PageContainer';
import { StatusTag, statusToTone } from '@/components/admin/StatusTag';
import { formatAmount, formatTime } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';
export function DashboardPage() {
  const { user } = useAuth(),
    role = normalizeRole(user?.role);
  const can = (permission: Parameters<typeof hasPermission>[1]) => hasPermission(role, permission);
  const results = useQueries({
    queries: [
      {
        queryKey: ['payment-settings'],
        queryFn: getPaymentSettings,
        enabled: can('payments.manage'),
      },
      {
        queryKey: ['orders', { limit: 50 }],
        queryFn: () => listOrders({ limit: 50 }),
        enabled: can('orders.view'),
      },
      { queryKey: ['apps'], queryFn: listAppsAdmin, enabled: can('apps.manage') },
      {
        queryKey: ['dashboard-tickets'],
        queryFn: () => listAdminTickets({ status: 'waiting_staff', limit: 5 }),
        enabled: can('tickets.manage'),
        staleTime: 30000,
      },
      {
        queryKey: ['dashboard-users'],
        queryFn: () => listUsers({ limit: 5 }),
        enabled: can('users.view'),
        staleTime: 30000,
      },
      {
        queryKey: ['dashboard-published-content'],
        queryFn: () => listContent({ status: 'published', limit: 1 }),
        enabled: can('content.manage'),
      },
      {
        queryKey: ['dashboard-paid-orders'],
        queryFn: () => listOrders({ status: 'paid', limit: 1 }),
        enabled: can('orders.view'),
      },
      {
        queryKey: ['dashboard-pending-orders'],
        queryFn: () => listOrders({ status: 'pending', limit: 1 }),
        enabled: can('orders.view'),
      },
    ],
  });
  const [payments, orders, apps, tickets, users, content, paid, pending] = results;
  const channels = payments.data?.items ?? [],
    applications = apps.data?.items ?? [],
    activeSecrets = applications
      .flatMap((a) => a.secrets ?? [])
      .filter((s) => !s.expiresAt || new Date(s.expiresAt) > new Date()).length;
  const links = [
    { label: '应用管理', href: '/admin/apps', permission: 'apps.manage' },
    { label: '订单管理', href: '/admin/orders', permission: 'orders.view' },
    { label: '授权管理', href: '/admin/licenses', permission: 'licenses.manage' },
    { label: '托管运维', href: '/admin/hosting', permission: 'jobs.manage' },
    { label: '用户管理', href: '/admin/users', permission: 'users.view' },
    { label: '内容管理', href: '/admin/content', permission: 'content.manage' },
    { label: '文档管理', href: '/admin/docs', permission: 'docs.manage' },
    { label: '支付设置', href: '/admin/payments', permission: 'payments.manage' },
    { label: '系统设置', href: '/admin/settings', permission: 'settings.manage' },
    { label: '售后工单', href: '/admin/tickets', permission: 'tickets.manage' },
  ] as const;
  return (
    <PageContainer title="仪表盘" width="wide">
      {results.filter((r) => r.isError).length > 0 && (
        <Alert
          type="warning"
          showIcon
          title="部分概览数据加载失败"
          action={
            <Button
              onClick={() => {
                for (const r of results) if (r.isError) void r.refetch();
              }}
            >
              重试失败项目
            </Button>
          }
        />
      )}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          {
            title: '接入应用',
            value: apps.data ? applications.length : '—',
            show: can('apps.manage'),
          },
          { title: '活跃密钥', value: apps.data ? activeSecrets : '—', show: can('apps.manage') },
          { title: '已支付订单', value: paid.data?.total ?? '—', show: can('orders.view') },
          { title: '待支付订单', value: pending.data?.total ?? '—', show: can('orders.view') },
        ]
          .filter((m) => m.show)
          .map((m) => (
            <Card className="admin-metric" key={m.title}>
              <Statistic title={m.title} value={m.value} />
            </Card>
          ))}
      </div>
      <Card title="待处理事项">
        <Space orientation="vertical" size={16}>
          {pending.data && (
            <Link to="/admin/orders?status=pending">{pending.data.total} 笔订单待支付</Link>
          )}
          {tickets.data && (
            <Link to="/admin/tickets?status=waiting_staff">{tickets.data.total} 张工单待回复</Link>
          )}
          {payments.data && (
            <Link to="/admin/payments">
              {channels.filter((c) => !c.configured).length} 个支付通道未配置
            </Link>
          )}
          {users.data && (
            <span>
              最近 {users.data.items.length} 个用户中，
              {users.data.items.filter((u) => !u.emailVerified).length} 个邮箱未验证（抽样）
            </span>
          )}
          {content.data && (
            <Link to="/admin/content">
              {content.data.total ? '查看已发布内容' : '发布第一篇内容'}
            </Link>
          )}
        </Space>
      </Card>
      {payments.data && (
        <Card title="支付通道">
          <Descriptions
            column={{ xs: 1, md: 2 }}
            items={channels.map((c) => ({
              key: c.code,
              label: c.code === 'wechat_pay' ? '微信支付' : '支付宝',
              children: (
                <Space>
                  <StatusTag
                    tone={c.configured ? 'ok' : 'neutral'}
                    label={c.configured ? '已配置' : '未配置'}
                  />
                  <Tag>{c.source}</Tag>
                  <Link to="/admin/payments">去配置</Link>
                </Space>
              ),
            }))}
          />
        </Card>
      )}
      <Card title="快捷入口">
        <Space wrap>
          {links
            .filter((l) => can(l.permission))
            .map((l) => (
              <Button key={l.href}>
                <Link to={l.href}>{l.label}</Link>
              </Button>
            ))}
        </Space>
      </Card>
      {can('orders.view') && (
        <Card title="最近订单" extra={<Link to="/admin/orders">查看全部</Link>}>
          <Table
            rowKey="orderNo"
            size="small"
            loading={orders.isPending}
            dataSource={orders.data?.items.slice(0, 6) ?? []}
            pagination={false}
            scroll={{ x: 900 }}
            columns={[
              {
                title: '订单号',
                dataIndex: 'orderNo',
                render: (v: string) => (
                  <Link to={`/admin/orders?search=${encodeURIComponent(v)}`}>{v}</Link>
                ),
              },
              { title: '客户', render: (_, o) => o.user?.email ?? o.userId },
              { title: '应用', render: (_, o) => o.app?.name ?? o.appId },
              { title: '金额', render: (_, o) => formatAmount(o.amount, o.currency) },
              {
                title: '状态',
                render: (_, o) => <StatusTag tone={statusToTone(o.status)} label={o.status} />,
              },
              { title: '时间', dataIndex: 'createdAt', render: (v: string) => formatTime(v) },
            ]}
          />
        </Card>
      )}
    </PageContainer>
  );
}
