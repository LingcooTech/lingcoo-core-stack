import { useQuery } from '@tanstack/react-query';
import { Input, Table, type TableColumnsType } from 'antd';
import { PageContainer } from '@/components/admin/PageContainer';
import { PageHelp } from '@/components/admin/PageHelp';
import { AsyncState } from '@/components/admin/AsyncState';
import { useDeferredValue, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { listInstalls } from '@/api/admin';
import type { HydratedInstall } from '@/api/types';
import { StatusTag, statusToTone } from '@/components/admin/StatusTag';
import { useTableState } from '@/hooks/useTableState';
import { recordStatusLabel } from '@/lib/portal-labels';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';
import { formatTime } from '@/lib/utils';

const PAGE_SIZE = 20;

function adminSearchHref(path: string, search: string) {
  return `${path}?search=${encodeURIComponent(search)}`;
}

function observabilityHref(search: string) {
  return `/admin/observability?tab=events&events.search=${encodeURIComponent(search)}`;
}

function userDetailHref(userId: string) {
  return `/admin/users?userId=${encodeURIComponent(userId)}`;
}

export function InstallsPage() {
  const { user } = useAuth();
  const canViewDeployments = hasPermission(normalizeRole(user?.role), 'deployments.view');
  const { page, search, setPage, setSearch } = useTableState({ defaultPageSize: PAGE_SIZE });
  const deferredSearch = useDeferredValue(search);

  const installQuery = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: deferredSearch.trim() || undefined,
    }),
    [deferredSearch, page],
  );
  const installsQuery = useQuery({
    queryKey: ['installs', installQuery],
    queryFn: () => listInstalls(installQuery),
  });
  const installs = installsQuery.data?.items ?? [];
  const totalInstalls = installsQuery.data?.total ?? 0;

  const installColumns: TableColumnsType<HydratedInstall> = [
    {
      key: 'install',
      title: '客户端安装',
      render: (_, row) => (
        <div>
          <p className="font-mono text-xs font-bold">{row.extensionInstallId}</p>
          {row.chromeProfileHint && (
            <p className="text-[10px] text-muted-foreground">{row.chromeProfileHint}</p>
          )}
          {row.appVersion && <p className="text-[10px] text-muted-foreground">v{row.appVersion}</p>}
        </div>
      ),
    },
    {
      key: 'app',
      title: '应用',
      render: (_, row) => (
        <div>
          <p className="font-mono text-xs">{row.app?.code ?? '—'}</p>
          <StatusTag tone="neutral" label={row.app?.type ?? '—'} className="mt-1" />
        </div>
      ),
    },
    {
      key: 'user',
      title: '用户',
      render: (_, row) => (
        <div>
          <p className="text-xs font-bold">{row.user?.email ?? '未绑定'}</p>
          {row.user?.displayName && (
            <p className="text-[10px] text-muted-foreground">{row.user.displayName}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      title: '登记状态',
      render: (_, row) => (
        <div className="flex flex-col gap-1">
          <StatusTag tone={statusToTone(row.status)} label={recordStatusLabel(row.status)} />
          <p className="text-[10px] text-muted-foreground">{formatTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'lastSeen',
      title: '最近上报',
      render: (_, row) => (
        <div>
          <p className="text-xs">{formatTime(row.lastSeenAt)}</p>
          <p className="text-[10px] text-muted-foreground">{formatTime(row.updatedAt)}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      title: '关联处理',
      className: 'min-w-[220px]',
      render: (_, row) => (
        <div className="flex flex-wrap gap-1.5">
          {row.user ? <ActionLink to={userDetailHref(row.user.id)} label="用户 360" /> : null}
          <ActionLink to={observabilityHref(row.extensionInstallId)} label="事件" />
          <ActionLink to={adminSearchHref('/admin/tickets', row.extensionInstallId)} label="工单" />
          <ActionLink
            to={adminSearchHref('/admin/licenses', row.user?.email ?? row.extensionInstallId)}
            label="授权"
          />
        </div>
      ),
    },
  ];

  return (
    <PageContainer
      title="客户端安装"
      description="查看客户端主动登记的版本和用户绑定，处理接入与授权问题。"
      filters={
        <Input.Search
          aria-label="搜索客户端安装"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索客户端安装 ID、用户、应用…"
          allowClear
          style={{ width: 340, maxWidth: '100%' }}
        />
      }
      actions={
        <>
          {canViewDeployments && <Link to="/admin/deployments">查看应用部署</Link>}
          <PageHelp>
            这里记录客户端主动调用登记接口产生的安装。使用 deploy token
            安装到服务器的记录位于“应用部署”。最近上报不是服务器健康状态；服务器、证书和备份在“托管运维”管理。
          </PageHelp>
        </>
      }
    >
      <AsyncState error={installsQuery.error} onRetry={() => void installsQuery.refetch()}>
        <Table
          columns={installColumns}
          dataSource={installs}
          loading={installsQuery.isLoading}
          rowKey="id"
          scroll={{ x: 1000 }}
          locale={{ emptyText: '暂无客户端登记记录' }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: totalInstalls,
            showSizeChanger: false,
            onChange: setPage,
            showTotal: (total) => `共 ${total} 条客户端安装记录`,
          }}
        />
      </AsyncState>
    </PageContainer>
  );
}

function ActionLink({ to, label }: { to: string; label: string }) {
  return <Link to={to}>{label}</Link>;
}
