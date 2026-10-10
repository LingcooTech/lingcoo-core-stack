import { AdminHostingExitPanel } from '@/components/admin/HostingExitPanel';
import { AdminHostingServicePanel } from '@/components/admin/HostingServicePanel';
import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Descriptions, Input, Select, Table, type TableColumnsType } from 'antd';
import type { AdminDeployment } from '@lingcoo/contracts';
import { apiClient } from '@/api/client';
import { PageContainer } from '@/components/admin/PageContainer';
import { PageHelp } from '@/components/admin/PageHelp';
import { AsyncState } from '@/components/admin/AsyncState';
import { ManagementDrawer } from '@/components/admin/ManagementDrawer';
import { StatusTag } from '@/components/admin/StatusTag';
import { formatTime } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';

const states: Record<string, string> = {
  ready: '交付就绪',
  waiting_capacity: '等待资源',
  pending_infrastructure: '准备环境',
  deploying: '部署中',
  runtime_ready: '验证入口',
  pending_tls: '配置证书',
  failed: '部署失败',
  cancelled: '已取消',
};
const entitlementLabels: Record<string, string> = {
  active: '有效',
  inactive: '已停用',
  cancelled: '已撤销',
  expired: '已过期',
};
function deliveryLabel(row: AdminDeployment) {
  if (row.status !== 'active') return '已停用';
  if (row.mode === 'managed') return states[row.hostingState ?? ''] ?? '等待部署';
  return row.lastDeployedAt ? '已有部署回报' : '等待部署回报';
}
export function AdminDeploymentsPage() {
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<AdminDeployment | null>(null);
  const { user } = useAuth();
  const can = (permission: 'settings.manage' | 'tickets.manage' | 'users.view') =>
    hasPermission(normalizeRole(user?.role), permission);
  const search = params.get('search') ?? '';
  const mode = ['managed', 'self_hosted'].includes(params.get('mode') ?? '')
    ? params.get('mode')!
    : 'all';
  const status = ['active', 'inactive', 'cancelled', 'expired'].includes(params.get('status') ?? '')
    ? params.get('status')!
    : 'all';
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(50001, rawPage) : 1;
  const delayedSearch = useDeferredValue(search);
  const change = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set(key, value);
        if (key !== 'page') next.delete('page');
        return next;
      },
      { replace: true },
    );
  const query = useQuery({
    queryKey: ['admin-deployments', delayedSearch, mode, status, page],
    queryFn: () =>
      apiClient(
        'GET /v1/admin/deployments',
        '/v1/admin/deployments?' +
          new URLSearchParams({
            search: delayedSearch,
            mode,
            status,
            limit: '20',
            offset: String((page - 1) * 20),
          }).toString(),
      ),
  });
  const columns: TableColumnsType<AdminDeployment> = [
    {
      key: 'label',
      className: 'min-w-[240px]',
      title: '应用 / 部署',
      render: (_, r) => (
        <div>
          <p className="font-medium">{r.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {r.appName} · {r.appCode}
          </p>
        </div>
      ),
    },
    {
      key: 'customer',
      className: 'min-w-[200px]',
      title: '客户',
      render: (_, r) => <span className="break-all">{r.customerEmail}</span>,
    },
    {
      key: 'mode',
      className: 'min-w-[150px] whitespace-nowrap',
      title: '部署方式',
      render: (_, r) => (
        <StatusTag
          tone={r.mode === 'managed' ? 'info' : 'neutral'}
          label={r.mode === 'managed' ? '平台托管' : '客户自有服务器'}
        />
      ),
    },
    {
      key: 'state',
      className: 'min-w-[120px] whitespace-nowrap',
      title: '交付状态',
      render: (_, r) => (
        <StatusTag
          tone={r.hostingState === 'failed' ? 'danger' : 'neutral'}
          label={deliveryLabel(r)}
        />
      ),
    },
    {
      key: 'domain',
      className: 'min-w-[240px]',
      title: '域名 / 服务器',
      render: (_, r) => (
        <div className="text-xs">
          <p className="break-all">{r.domains.join('、') || '尚未配置域名'}</p>
          <p className="mt-1 text-muted-foreground">{r.nodeName ?? r.serverHost ?? '尚未分配'}</p>
        </div>
      ),
    },
    {
      key: 'action',
      className: 'min-w-[110px] whitespace-nowrap',
      title: '详情',
      render: (_, r) => (
        <Button size="small" onClick={() => setSelected(r)}>
          查看详情
        </Button>
      ),
    },
  ];
  return (
    <PageContainer
      title="应用部署"
      actions={
        <>
          <Button loading={query.isFetching} onClick={() => void query.refetch()}>
            刷新
          </Button>
          <PageHelp>
            这里记录服务器部署，与客户端安装分开管理。交付状态不代表实时运行健康；平台托管的运行状态在托管运维查看。
          </PageHelp>
        </>
      }
      filters={
        <>
          <Input.Search
            aria-label="搜索应用部署"
            maxLength={200}
            placeholder="搜索客户、应用、部署名称、ID、服务器或托管域名"
            value={search}
            onChange={(event) => change('search', event.target.value)}
            allowClear
            style={{ width: 420, maxWidth: '100%' }}
          />
          <Select
            aria-label="部署方式"
            value={mode}
            onChange={(value) => change('mode', value)}
            style={{ width: 180 }}
            options={[
              { value: 'all', label: '全部部署方式' },
              { value: 'self_hosted', label: '客户自有服务器' },
              { value: 'managed', label: '平台托管' },
            ]}
          />
          <Select
            aria-label="记录状态"
            value={status}
            onChange={(value) => change('status', value)}
            style={{ width: 150 }}
            options={[
              { value: 'all', label: '全部记录' },
              { value: 'active', label: '有效记录' },
              { value: 'inactive', label: '已停用' },
              { value: 'cancelled', label: '已取消' },
              { value: 'expired', label: '已过期' },
            ]}
          />
        </>
      }
    >
      <AsyncState error={query.error} onRetry={() => void query.refetch()}>
        <Table
          columns={columns}
          dataSource={query.data?.items ?? []}
          rowKey="id"
          loading={query.isPending}
          scroll={{ x: 1060 }}
          locale={{ emptyText: '没有匹配的部署记录' }}
          pagination={{
            current: page,
            pageSize: 20,
            total: query.data?.total ?? 0,
            showSizeChanger: false,
            onChange: (value) => change('page', String(value)),
          }}
        />
      </AsyncState>
      <ManagementDrawer
        open={!!selected}
        title={selected?.label ?? '部署详情'}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className="space-y-5 p-4">
            <Descriptions
              column={1}
              size="small"
              bordered
              items={[
                ['部署 ID', selected.id],
                ['应用', `${selected.appName} (${selected.appCode})`],
                ['客户', selected.customerEmail],
                ['部署方式', selected.mode === 'managed' ? '平台托管' : '客户自有服务器'],
                ['交付状态', deliveryLabel(selected)],
                ['域名', selected.domains.join('、') || '未配置'],
                ['服务器', selected.nodeName ?? selected.serverHost ?? '未分配'],
                ['权益 ID', selected.entitlementId ?? '未关联'],
                [
                  '权益状态',
                  selected.entitlementStatus === 'active' &&
                  selected.entitlementExpiresAt &&
                  Date.parse(selected.entitlementExpiresAt) < Date.now()
                    ? '已过期'
                    : (entitlementLabels[selected.entitlementStatus ?? ''] ?? '未关联'),
                ],
                [
                  '权益到期',
                  selected.entitlementId
                    ? selected.entitlementExpiresAt
                      ? formatTime(selected.entitlementExpiresAt)
                      : '未设置到期时间'
                    : '未关联',
                ],
                ['创建时间', formatTime(selected.createdAt)],
                [
                  '最近部署回报',
                  selected.lastDeployedAt ? formatTime(selected.lastDeployedAt) : '尚无部署回报',
                ],
                [
                  '最近实例上报',
                  selected.lastReportedAt ? formatTime(selected.lastReportedAt) : '尚无上报',
                ],
              ].map(([label, value]) => ({ key: label, label, children: value }))}
            />
            {selected.mode === 'managed' && (
              <>
                <AdminHostingServicePanel deploymentId={selected.id} />
                <AdminHostingExitPanel deploymentId={selected.id} />
              </>
            )}
            <div className="flex flex-wrap gap-2">
              {can('users.view') && (
                <Link to={`/admin/users?userId=${selected.userId}`}>客户资料</Link>
              )}
              {can('tickets.manage') && (
                <Link to={`/admin/tickets?deploymentId=${selected.id}`}>关联工单</Link>
              )}
              {selected.mode === 'managed' &&
                selected.status === 'active' &&
                can('settings.manage') && (
                  <Link to={`/admin/hosting?tab=instances&deploymentId=${selected.id}`}>
                    托管运维
                  </Link>
                )}
            </div>
          </div>
        )}
      </ManagementDrawer>
    </PageContainer>
  );
}
