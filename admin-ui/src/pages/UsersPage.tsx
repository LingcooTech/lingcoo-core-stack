import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { App, Button, Form, Input, Modal, Select, Table, type TableColumnsType } from 'antd';
import { AdminUpdateUserInputSchema } from '@lingcoo/contracts';
import {
  activateUser,
  getUser,
  listUsers,
  resetUserPassword,
  suspendUser,
  updateUser,
} from '@/api/admin';
import type {
  AdminUser,
  AdminUserDetail,
  AdminUpdateUserInput,
  AuditLog,
  Event as AdminEvent,
  HydratedEntitlement,
  HydratedInstall,
  HydratedOrder,
  HydratedSupportTicket,
} from '@/api/types';
import { PageContainer } from '@/components/admin/PageContainer';
import { AsyncState } from '@/components/admin/AsyncState';
import { ManagementDrawer } from '@/components/admin/ManagementDrawer';
import { StatusTag, statusToTone } from '@/components/admin/StatusTag';
import { useTableState } from '@/hooks/useTableState';
import { useAuth } from '@/lib/auth';
import { entitlementStatusLabel, orderStatusLabel, recordStatusLabel } from '@/lib/portal-labels';
import { hasPermission, normalizeRole, roleLabels, type AppRole } from '@/lib/rbac';
import { formatAmount, formatTime } from '@/lib/utils';

function adminSearchHref(path: string, search: string) {
  return `${path}?search=${encodeURIComponent(search)}`;
}

function observabilityHref(tab: 'events' | 'audits', search: string) {
  return `/admin/observability?tab=${tab}&${tab}.search=${encodeURIComponent(search)}`;
}

function ticketStatusLabel(status: HydratedSupportTicket['status']) {
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

function ticketStatusTone(status: HydratedSupportTicket['status']) {
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

export function UsersPage() {
  const qc = useQueryClient();
  const { message, modal } = App.useApp();
  const { user: currentUser } = useAuth();
  const currentRole = normalizeRole(currentUser?.role);
  const [searchParams, setSearchParams] = useSearchParams();

  const { page, search, filters, setPage, setSearch, setFilter, clearFilters } = useTableState({
    defaultPageSize: 20,
    knownFilters: ['role', 'status'],
  });
  const roleValues = useMemo(() => filters.role ?? [], [filters.role]);
  const statusValues = useMemo(() => filters.status ?? [], [filters.status]);

  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm] = Form.useForm<AdminUpdateUserInput>();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(() =>
    searchParams.get('userId'),
  );

  const [confirmAction, setConfirmAction] = useState<{
    type: 'suspend' | 'activate';
    user: AdminUser;
  } | null>(null);
  const [resetConfirm, setResetConfirm] = useState<AdminUser | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(
    null,
  );

  const usersQuery = useQuery({
    queryKey: ['admin-users', page, search, roleValues, statusValues],
    queryFn: () =>
      listUsers({
        limit: 20,
        offset: (page - 1) * 20,
        search: search || undefined,
        role: roleValues[0],
        status: statusValues[0],
      }),
  });
  const users = usersQuery.data?.items ?? [];
  const userDetailQuery = useQuery({
    queryKey: ['admin-user-detail', selectedUserId],
    queryFn: () => getUser(selectedUserId!),
    enabled: Boolean(selectedUserId),
  });

  useEffect(() => {
    const nextUserId = searchParams.get('userId');
    setSelectedUserId((current) => (current === nextUserId ? current : nextUserId));
  }, [searchParams]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const values = AdminUpdateUserInputSchema.parse(await editForm.validateFields());
      return updateUser(editingUser!.id, {
        displayName: values.displayName,
        ...(canManageRoles && editingUser && !isSelf(editingUser) ? { role: values.role } : {}),
        ...(canSuspendUsers && editingUser && !isSelf(editingUser)
          ? { status: values.status }
          : {}),
      });
    },
    onSuccess: () => {
      void message.success('用户信息已更新');
      setEditOpen(false);
      setEditingUser(null);
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      if (editingUser?.id) {
        void qc.invalidateQueries({ queryKey: ['admin-user-detail', editingUser.id] });
      }
    },
    onError: (err) => void message.error(err instanceof Error ? err.message : '更新失败'),
  });

  const suspendMutation = useMutation({
    mutationFn: (userId: string) => suspendUser(userId),
    onSuccess: () => {
      void message.success('用户已停用');
      setConfirmAction(null);
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      void qc.invalidateQueries({ queryKey: ['admin-user-detail'] });
    },
    onError: (err) => void message.error(err instanceof Error ? err.message : '停用失败'),
  });

  const activateMutation = useMutation({
    mutationFn: (userId: string) => activateUser(userId),
    onSuccess: () => {
      void message.success('用户已激活');
      setConfirmAction(null);
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      void qc.invalidateQueries({ queryKey: ['admin-user-detail'] });
    },
    onError: (err) => void message.error(err instanceof Error ? err.message : '激活失败'),
  });

  const resetMutation = useMutation({
    mutationFn: (userId: string) => resetUserPassword(userId),
    onSuccess: (result) => {
      setResetConfirm(null);
      setTempPassword({ email: result.email, password: result.temporaryPassword });
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => void message.error(err instanceof Error ? err.message : '重置失败'),
  });

  function openEdit(u: AdminUser) {
    setEditingUser(u);
    editForm.resetFields();
    editForm.setFields([
      { name: 'displayName', value: u.displayName ?? '', touched: false },
      { name: 'role', value: u.role, touched: false },
      { name: 'status', value: u.status, touched: false },
    ]);
    setEditOpen(true);
  }

  function openUserDetail(userId: string) {
    setSelectedUserId(userId);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('userId', userId);
        return next;
      },
      { replace: true },
    );
  }

  function closeUserDetail() {
    setSelectedUserId(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('userId');
        return next;
      },
      { replace: true },
    );
  }

  const isSelf = (u: AdminUser) => currentUser?.id === u.id;
  const canEditUsers = hasPermission(currentRole, 'users.edit');
  const canManageRoles = hasPermission(currentRole, 'users.role_manage');
  const canSuspendUsers = hasPermission(currentRole, 'users.suspend');
  const canResetPasswords = hasPermission(currentRole, 'users.reset_password');

  const columns: TableColumnsType<AdminUser> = [
    {
      key: 'user',
      title: '用户',
      render: (_, row) => (
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-foreground">{row.email}</p>
          {row.displayName ? (
            <p className="truncate text-[10px] text-muted-foreground">{row.displayName}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'role',
      title: '角色',
      render: (_, row) => (
        <StatusTag
          tone={row.role === 'admin' ? 'ok' : row.role === 'user' ? 'neutral' : 'info'}
          label={roleLabels[(row.role as AppRole) ?? 'user'] ?? row.role}
        />
      ),
    },
    {
      key: 'status',
      title: '账户 / 邮箱',
      render: (_, row) => (
        <div className="inline-flex items-center gap-1.5">
          <StatusTag
            tone={row.status === 'active' ? 'ok' : 'warn'}
            label={recordStatusLabel(row.status)}
          />
          <StatusTag
            tone={row.emailVerified ? 'ok' : 'warn'}
            label={row.emailVerified ? '已验证' : '未验证'}
          />
        </div>
      ),
    },
    {
      key: 'createdAt',
      title: '注册时间',
      render: (_, row) => (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      className: 'w-[260px]',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <Button
            size="small"
            className="h-7 px-2 text-xs"
            onClick={(event) => {
              event.stopPropagation();
              openUserDetail(row.id);
            }}
          >
            查看
          </Button>
          {canEditUsers ? (
            <Button
              size="small"
              className="h-7 px-2 text-xs"
              onClick={(event) => {
                event.stopPropagation();
                openEdit(row);
              }}
            >
              编辑
            </Button>
          ) : null}
          {canSuspendUsers ? (
            row.status === 'active' ? (
              <Button
                size="small"
                type="text"
                className="h-7 px-2 text-xs text-muted-foreground"
                disabled={isSelf(row)}
                onClick={(event) => {
                  event.stopPropagation();
                  setConfirmAction({ type: 'suspend', user: row });
                }}
              >
                停用
              </Button>
            ) : (
              <Button
                size="small"
                type="text"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  setConfirmAction({ type: 'activate', user: row });
                }}
              >
                激活
              </Button>
            )
          ) : null}
          {canResetPasswords ? (
            <Button
              size="small"
              type="text"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={(event) => {
                event.stopPropagation();
                setResetConfirm(row);
              }}
            >
              重置密码
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const closeEdit = async () => {
    if (updateMutation.isPending) return;
    if (
      editForm.isFieldsTouched() &&
      !(await modal.confirm({
        title: '放弃未保存的用户修改？',
        okText: '放弃修改',
        cancelText: '继续编辑',
      }))
    )
      return;
    setEditOpen(false);
  };
  return (
    <PageContainer
      title="用户管理"
      description="查询用户与关联业务记录；角色、停用和密码操作受独立权限控制。"
      filters={
        <>
          <Input.Search
            aria-label="搜索用户"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            allowClear
            placeholder="搜索邮箱或名称…"
            style={{ width: 320, maxWidth: '100%' }}
          />
          <Select
            value={roleValues[0]}
            allowClear
            aria-label="用户角色"
            placeholder="全部角色"
            style={{ width: 140 }}
            options={Object.entries(roleLabels).map(([value, label]) => ({ value, label }))}
            onChange={(value) => setFilter('role', value ? [value] : [])}
          />
          <Select
            value={statusValues[0]}
            allowClear
            aria-label="用户状态"
            placeholder="全部状态"
            style={{ width: 140 }}
            options={[
              { value: 'active', label: '活跃' },
              { value: 'suspended', label: '已停用' },
            ]}
            onChange={(value) => setFilter('status', value ? [value] : [])}
          />
          <Button onClick={clearFilters}>清除筛选</Button>
        </>
      }
    >
      <AsyncState error={usersQuery.error} onRetry={() => void usersQuery.refetch()}>
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={usersQuery.isLoading}
          pagination={{
            current: page,
            pageSize: 20,
            total: usersQuery.data?.total ?? 0,
            showSizeChanger: false,
            onChange: setPage,
          }}
          scroll={{ x: 900 }}
          locale={{ emptyText: '暂无用户' }}
        />
      </AsyncState>
      <ManagementDrawer
        open={!!selectedUserId}
        title={`用户详情 · ${userDetailQuery.data?.email ?? selectedUserId ?? ''}`}
        onClose={closeUserDetail}
        size="large"
      >
        <AsyncState
          loading={userDetailQuery.isLoading}
          error={userDetailQuery.error}
          onRetry={() => void userDetailQuery.refetch()}
        >
          {userDetailQuery.data && <UserDetailPanel detail={userDetailQuery.data} />}
        </AsyncState>
      </ManagementDrawer>
      <Modal
        open={editOpen}
        forceRender
        title={`编辑用户 · ${editingUser?.email ?? ''}`}
        okText="保存"
        cancelText="取消"
        confirmLoading={updateMutation.isPending}
        onCancel={() => {
          void closeEdit();
        }}
        onOk={() => {
          if (!updateMutation.isPending) editForm.submit();
        }}
      >
        <Form
          form={editForm}
          layout="vertical"
          disabled={updateMutation.isPending}
          onFinish={() => updateMutation.mutate()}
        >
          <Form.Item name="displayName" label="显示名称">
            <Input placeholder="用户昵称" />
          </Form.Item>
          <Form.Item
            name="role"
            label="角色"
            extra={
              editingUser && isSelf(editingUser)
                ? '不能修改自己的角色'
                : !canManageRoles
                  ? '当前角色没有修改用户角色的权限'
                  : undefined
            }
          >
            <Select
              options={Object.entries(roleLabels).map(([value, label]) => ({ value, label }))}
              disabled={
                updateMutation.isPending ||
                !canManageRoles ||
                !!(editingUser && isSelf(editingUser))
              }
            />
          </Form.Item>
          <Form.Item
            name="status"
            label="状态"
            extra={
              editingUser && isSelf(editingUser)
                ? '不能修改自己的状态'
                : !canSuspendUsers
                  ? '当前角色没有修改用户状态的权限'
                  : undefined
            }
          >
            <Select
              options={[
                { value: 'active', label: '活跃' },
                { value: 'suspended', label: '已停用' },
              ]}
              disabled={
                updateMutation.isPending ||
                !canSuspendUsers ||
                !!(editingUser && isSelf(editingUser))
              }
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={!!confirmAction}
        title={confirmAction?.type === 'suspend' ? '停用用户' : '激活用户'}
        okText={confirmAction?.type === 'suspend' ? '确认停用' : '确认激活'}
        cancelText="取消"
        okButtonProps={{ danger: confirmAction?.type === 'suspend' }}
        confirmLoading={suspendMutation.isPending || activateMutation.isPending}
        onCancel={() => setConfirmAction(null)}
        onOk={() => {
          if (!confirmAction || suspendMutation.isPending || activateMutation.isPending) return;
          if (confirmAction.type === 'suspend') suspendMutation.mutate(confirmAction.user.id);
          else activateMutation.mutate(confirmAction.user.id);
        }}
      >
        {confirmAction?.type === 'suspend'
          ? `确认停用用户 ${confirmAction.user.email}？停用后无法登录。`
          : `确认激活用户 ${confirmAction?.user.email}？`}
      </Modal>
      <Modal
        open={!!resetConfirm}
        title="重置密码"
        okText="确认重置"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        confirmLoading={resetMutation.isPending}
        onCancel={() => setResetConfirm(null)}
        onOk={() => {
          if (resetConfirm && !resetMutation.isPending) resetMutation.mutate(resetConfirm.id);
        }}
      >
        确认为用户 {resetConfirm?.email} 重置密码？将生成一个临时密码。
      </Modal>
      <Modal
        open={!!tempPassword}
        title="密码已重置"
        onCancel={() => setTempPassword(null)}
        footer={
          <Button type="primary" onClick={() => setTempPassword(null)}>
            关闭
          </Button>
        }
        destroyOnHidden
      >
        <p>用户 {tempPassword?.email} 的临时密码仅显示一次，请妥善传达。</p>
        <p className="my-4 text-center font-mono text-lg break-all select-all">
          {tempPassword?.password}
        </p>
      </Modal>
    </PageContainer>
  );
}

function UserDetailPanel({ detail }: { detail: AdminUserDetail }) {
  const { activity } = detail;
  const grantHref = `/admin/licenses?grantUserEmail=${encodeURIComponent(detail.email)}`;

  const orderColumns: TableColumnsType<HydratedOrder> = [
    {
      key: 'orderNo',
      title: '订单号',
      render: (_, row) => <span className="font-mono text-[11px]">{row.orderNo}</span>,
    },
    {
      key: 'product',
      title: '产品',
      render: (_, row) => (
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-foreground">
            {row.app?.name ?? row.appId}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {row.plan?.name ?? row.planId}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (_, row) => (
        <StatusTag tone={statusToTone(row.status)} label={orderStatusLabel(row.status)} />
      ),
    },
    {
      key: 'amount',
      title: '金额',
      render: (_, row) => (
        <span className="text-[11px] font-medium tabular-nums">
          {formatAmount(row.amount, row.currency)}
        </span>
      ),
    },
    {
      key: 'createdAt',
      title: '创建时间',
      render: (_, row) => (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '跳转',
      className: 'w-[76px]',
      render: (_, row) => (
        <Link to={adminSearchHref('/admin/orders', row.orderNo)}>
          查看
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      ),
    },
  ];

  const entitlementColumns: TableColumnsType<HydratedEntitlement> = [
    {
      key: 'app',
      title: '应用',
      render: (_, row) => row.app?.name ?? row.appId,
    },
    {
      key: 'plan',
      title: '套餐',
      render: (_, row) => (
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-foreground">
            {row.plan?.name ?? row.planId}
          </p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {row.plan?.code ?? row.sourceType}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (_, row) => (
        <StatusTag tone={statusToTone(row.status)} label={entitlementStatusLabel(row.status)} />
      ),
    },
    {
      key: 'expiresAt',
      title: '到期时间',
      render: (_, row) => (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatTime(row.expiresAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '处置',
      className: 'w-[76px]',
      render: (_, row) => (
        <Link to={adminSearchHref('/admin/licenses', row.id)}>
          查看
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      ),
    },
  ];

  const installColumns: TableColumnsType<HydratedInstall> = [
    {
      key: 'install',
      title: '客户端安装',
      render: (_, row) => <span className="font-mono text-[11px]">{row.extensionInstallId}</span>,
    },
    {
      key: 'app',
      title: '应用',
      render: (_, row) => row.app?.name ?? '—',
    },
    {
      key: 'status',
      title: '状态',
      render: (_, row) => (
        <StatusTag tone={statusToTone(row.status)} label={recordStatusLabel(row.status)} />
      ),
    },
    {
      key: 'lastSeenAt',
      title: '最后活跃',
      render: (_, row) => (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatTime(row.lastSeenAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '跳转',
      className: 'w-[76px]',
      render: (_, row) => (
        <Link to={adminSearchHref('/admin/installs', row.extensionInstallId)}>
          查看
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      ),
    },
  ];

  const eventColumns: TableColumnsType<AdminEvent> = [
    {
      key: 'eventName',
      title: '事件',
      render: (_, row) => <span className="font-mono text-[11px]">{row.eventName}</span>,
    },
    {
      key: 'appId',
      title: '应用',
      render: (_, row) => <span className="font-mono text-[11px]">{row.appId ?? '—'}</span>,
    },
    {
      key: 'installId',
      title: '安装',
      render: (_, row) => <span className="font-mono text-[11px]">{row.installId ?? '—'}</span>,
    },
    {
      key: 'eventTime',
      title: '发生时间',
      render: (_, row) => (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatTime(row.eventTime)}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '跳转',
      className: 'w-[76px]',
      render: (_, row) => (
        <Link to={observabilityHref('events', row.eventName)}>
          查看
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      ),
    },
  ];

  const auditColumns: TableColumnsType<AuditLog> = [
    {
      key: 'action',
      title: '动作',
      render: (_, row) => <span className="font-mono text-[11px]">{row.action}</span>,
    },
    {
      key: 'resource',
      title: '资源',
      render: (_, row) => (
        <span className="font-mono text-[11px]">
          {row.resourceType}/{row.resourceId ?? '—'}
        </span>
      ),
    },
    {
      key: 'outcome',
      title: '结果',
      render: (_, row) => <StatusTag tone={statusToTone(row.outcome)} label={row.outcome} />,
    },
    {
      key: 'createdAt',
      title: '时间',
      render: (_, row) => (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '跳转',
      className: 'w-[76px]',
      render: (_, row) => (
        <Link to={observabilityHref('audits', row.action)}>
          查看
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      ),
    },
  ];

  const ticketColumns: TableColumnsType<HydratedSupportTicket> = [
    {
      key: 'ticketNo',
      title: '工单号',
      render: (_, row) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-[12px] font-semibold text-foreground">
            {row.ticketNo}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">{row.subject}</p>
        </div>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (_, row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusTag tone={ticketStatusTone(row.status)} label={ticketStatusLabel(row.status)} />
          <StatusTag tone="neutral" label={row.category} />
        </div>
      ),
    },
    {
      key: 'context',
      title: '关联',
      render: (_, row) => (
        <div className="space-y-0.5 text-[10px] text-muted-foreground">
          <p>{row.app?.name ?? row.app?.code ?? '未关联应用'}</p>
          {row.order ? <p className="font-mono">order: {row.order.orderNo}</p> : null}
          {row.install ? (
            <p className="font-mono">install: {row.install.extensionInstallId}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'lastActivityAt',
      title: '最近活动',
      render: (_, row) => (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatTime(row.lastActivityAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '处置',
      className: 'w-[76px]',
      render: (_, row) => (
        <Link to={adminSearchHref('/admin/tickets', row.ticketNo)}>
          查看
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-5 text-sm">
      <section className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl border border-border bg-card p-4 md:grid-cols-3">
        <InfoBlock label="邮箱" value={detail.email} />
        <InfoBlock label="显示名称" value={detail.displayName ?? '—'} />
        <InfoBlock
          label="角色"
          render={
            <StatusTag
              tone={detail.role === 'admin' ? 'ok' : detail.role === 'user' ? 'neutral' : 'info'}
              label={roleLabels[(detail.role as AppRole) ?? 'user'] ?? detail.role}
            />
          }
        />
        <InfoBlock
          label="账户状态"
          render={
            <StatusTag
              tone={statusToTone(detail.status)}
              label={recordStatusLabel(detail.status)}
            />
          }
        />
        <InfoBlock
          label="邮箱验证"
          render={
            <StatusTag
              tone={detail.emailVerified ? 'ok' : 'warn'}
              label={detail.emailVerified ? '已验证' : '未验证'}
            />
          }
        />
        <InfoBlock label="注册时间" value={formatTime(detail.createdAt)} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="最近订单" value={activity.summary.recentOrders} />
        <MetricCard label="活跃授权" value={activity.summary.activeEntitlements} />
        <MetricCard label="客户端安装" value={activity.summary.installs} />
        <MetricCard label="工单" value={activity.summary.tickets} />
        <MetricCard label="审计日志" value={activity.summary.auditLogs} />
        <MetricCard label="产品事件" value={activity.summary.events} />
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">运营入口</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              按当前用户过滤关联模块，进入后可继续执行订单同步、退款、授权撤销或排障。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionLink to={adminSearchHref('/admin/orders', detail.email)} label="订单管理" />
          <ActionLink to={adminSearchHref('/admin/licenses', detail.email)} label="授权明细" />
          <ActionLink to={grantHref} label="发放授权" />
          <ActionLink to={adminSearchHref('/admin/tickets', detail.email)} label="工单管理" />
          <ActionLink to={adminSearchHref('/admin/installs', detail.email)} label="客户端安装" />
          <ActionLink to={observabilityHref('events', detail.email)} label="事件流" />
          <ActionLink to={observabilityHref('audits', detail.id)} label="审计日志" />
        </div>
      </section>

      <DetailSection title={`最近订单 (${activity.orders.length})`}>
        <Table
          columns={orderColumns}
          dataSource={activity.orders}
          rowKey="id"
          pagination={false}
          scroll={{ x: 700 }}
          locale={{ emptyText: '暂无订单' }}
        />
      </DetailSection>

      <DetailSection title={`最近授权 (${activity.entitlements.length})`}>
        <Table
          columns={entitlementColumns}
          dataSource={activity.entitlements}
          rowKey="id"
          pagination={false}
          scroll={{ x: 700 }}
          locale={{ emptyText: '暂无授权' }}
        />
      </DetailSection>

      <DetailSection title={`客户端安装 (${activity.installs.length})`}>
        <Table
          columns={installColumns}
          dataSource={activity.installs}
          rowKey="id"
          pagination={false}
          scroll={{ x: 700 }}
          locale={{ emptyText: '暂无客户端安装' }}
        />
      </DetailSection>

      <DetailSection title={`最近工单 (${activity.tickets.length})`}>
        <Table
          columns={ticketColumns}
          dataSource={activity.tickets}
          rowKey="id"
          pagination={false}
          scroll={{ x: 700 }}
          locale={{ emptyText: '暂无工单' }}
        />
      </DetailSection>

      <DetailSection title={`最近事件 (${activity.events.length})`}>
        <Table
          columns={eventColumns}
          dataSource={activity.events}
          rowKey="id"
          pagination={false}
          scroll={{ x: 700 }}
          locale={{ emptyText: '暂无事件' }}
        />
      </DetailSection>

      <DetailSection title={`审计日志 (${activity.auditLogs.length})`}>
        <Table
          columns={auditColumns}
          dataSource={activity.auditLogs}
          rowKey="id"
          pagination={false}
          scroll={{ x: 700 }}
          locale={{ emptyText: '暂无审计日志' }}
        />
      </DetailSection>
    </div>
  );
}

function ActionLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to}>
      {label}
      <ArrowUpRight className="h-3 w-3" />
    </Link>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="overflow-hidden rounded-lg border border-border bg-card">{children}</div>
    </section>
  );
}

function InfoBlock({
  label,
  value,
  render,
}: {
  label: string;
  value?: string;
  render?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <div className="mt-1">
        {render ?? <p className="truncate text-xs font-medium text-foreground">{value}</p>}
      </div>
    </div>
  );
}
