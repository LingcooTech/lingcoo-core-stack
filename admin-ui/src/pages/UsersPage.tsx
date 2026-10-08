import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
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
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterChipBar, type FilterChipConfig } from '@/components/shared/FilterChipBar';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
  const { user: currentUser } = useAuth();
  const currentRole = normalizeRole(currentUser?.role);
  const [searchParams, setSearchParams] = useSearchParams();

  const { search, filters, setSearch, setFilter, clearFilters } = useTableState({
    knownFilters: ['role', 'status'],
  });
  const roleValues = useMemo(() => filters.role ?? [], [filters.role]);
  const statusValues = useMemo(() => filters.status ?? [], [filters.status]);

  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<AdminUpdateUserInput>({});
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

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search, roleValues, statusValues],
    queryFn: () =>
      listUsers({
        limit: 100,
        search: search || undefined,
        // 后端 role/status 当前为单值；多选时取首项
        role: roleValues[0],
        status: statusValues[0],
      }),
  });
  const users = data?.items ?? [];
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
    mutationFn: () => updateUser(editingUser!.id, editForm),
    onSuccess: () => {
      toast.success('用户信息已更新');
      setEditOpen(false);
      setEditingUser(null);
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      if (editingUser?.id) {
        void qc.invalidateQueries({ queryKey: ['admin-user-detail', editingUser.id] });
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '更新失败'),
  });

  const suspendMutation = useMutation({
    mutationFn: (userId: string) => suspendUser(userId),
    onSuccess: () => {
      toast.success('用户已停用');
      setConfirmAction(null);
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      void qc.invalidateQueries({ queryKey: ['admin-user-detail'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '停用失败'),
  });

  const activateMutation = useMutation({
    mutationFn: (userId: string) => activateUser(userId),
    onSuccess: () => {
      toast.success('用户已激活');
      setConfirmAction(null);
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      void qc.invalidateQueries({ queryKey: ['admin-user-detail'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '激活失败'),
  });

  const resetMutation = useMutation({
    mutationFn: (userId: string) => resetUserPassword(userId),
    onSuccess: (result) => {
      setResetConfirm(null);
      setTempPassword({ email: result.email, password: result.temporaryPassword });
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '重置失败'),
  });

  function openEdit(u: AdminUser) {
    setEditingUser(u);
    setEditForm({
      displayName: u.displayName ?? '',
      role: u.role as AppRole,
      status: u.status as 'active' | 'suspended',
    });
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

  const chips: FilterChipConfig[] = [
    {
      id: 'role',
      label: '角色',
      values: roleValues,
      onChange: (next) => setFilter('role', next),
      options: [
        { value: 'admin', label: '管理员' },
        { value: 'operator', label: '运营' },
        { value: 'finance', label: '财务' },
        { value: 'support', label: '客服' },
        { value: 'editor', label: '内容编辑' },
        { value: 'user', label: '普通用户' },
      ],
    },
    {
      id: 'status',
      label: '状态',
      values: statusValues,
      onChange: (next) => setFilter('status', next),
      options: [
        { value: 'active', label: '活跃' },
        { value: 'suspended', label: '已停用' },
      ],
    },
  ];

  const columns: Column<AdminUser>[] = [
    {
      key: 'user',
      header: '用户',
      cell: (row) => (
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
      header: '角色',
      cell: (row) => (
        <StatusPill
          tone={row.role === 'admin' ? 'ok' : row.role === 'user' ? 'neutral' : 'info'}
          label={roleLabels[(row.role as AppRole) ?? 'user'] ?? row.role}
        />
      ),
    },
    {
      key: 'status',
      header: '账户 / 邮箱',
      cell: (row) => (
        <div className="inline-flex items-center gap-1.5">
          <StatusPill
            tone={row.status === 'active' ? 'ok' : 'warn'}
            label={recordStatusLabel(row.status)}
          />
          <StatusPill
            tone={row.emailVerified ? 'ok' : 'warn'}
            label={row.emailVerified ? '已验证' : '未验证'}
          />
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: '注册时间',
      cell: (row) => (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      className: 'w-[260px]',
      cell: (row) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
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
              size="sm"
              variant="outline"
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
                size="sm"
                variant="ghost"
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
                size="sm"
                variant="ghost"
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
              size="sm"
              variant="ghost"
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

  return (
    <div>
      <SectionHeader sectionKey="users" />
      <div className="space-y-4 p-6">
        <FilterChipBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="搜索邮箱或名称..."
          chips={chips}
          onClearAll={clearFilters}
        />

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <DataTable
            columns={columns}
            data={users}
            isLoading={isLoading}
            emptyMessage="暂无用户"
            getRowKey={(row) => row.id}
            onRowClick={(row) => openUserDetail(row.id)}
          />
        </div>
      </div>

      {selectedUserId ? (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) closeUserDetail();
          }}
        >
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-4xl">
            <SheetHeader className="border-b border-border px-6 py-4">
              <SheetDescription className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                用户详情
              </SheetDescription>
              <SheetTitle className="truncate text-base font-semibold text-foreground">
                {userDetailQuery.data?.email ?? selectedUserId}
              </SheetTitle>
            </SheetHeader>
            <div className="px-6 py-5">
              {userDetailQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="h-9 animate-pulse rounded-md bg-muted" />
                  ))}
                </div>
              ) : userDetailQuery.data ? (
                <UserDetailPanel detail={userDetailQuery.data} />
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
            <DialogDescription>修改 {editingUser?.email} 的用户信息</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>显示名称</Label>
              <Input
                value={editForm.displayName ?? ''}
                onChange={(e) => setEditForm((prev) => ({ ...prev, displayName: e.target.value }))}
                placeholder="用户昵称"
              />
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <Select
                value={editForm.role ?? 'user'}
                onValueChange={(v) => setEditForm((prev) => ({ ...prev, role: v as AppRole }))}
                disabled={!canManageRoles || (editingUser ? isSelf(editingUser) : false)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="operator">运营</SelectItem>
                  <SelectItem value="finance">财务</SelectItem>
                  <SelectItem value="support">客服</SelectItem>
                  <SelectItem value="editor">内容编辑</SelectItem>
                  <SelectItem value="user">普通用户</SelectItem>
                </SelectContent>
              </Select>
              {editingUser && (isSelf(editingUser) || !canManageRoles) && (
                <p className="text-xs text-muted-foreground">
                  {isSelf(editingUser) ? '不能修改自己的角色' : '当前角色没有修改用户角色的权限'}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select
                value={editForm.status ?? 'active'}
                onValueChange={(v) =>
                  setEditForm((prev) => ({ ...prev, status: v as 'active' | 'suspended' }))
                }
                disabled={!canSuspendUsers || (editingUser ? isSelf(editingUser) : false)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">活跃</SelectItem>
                  <SelectItem value="suspended">已停用</SelectItem>
                </SelectContent>
              </Select>
              {editingUser && (isSelf(editingUser) || !canSuspendUsers) && (
                <p className="text-xs text-muted-foreground">
                  {isSelf(editingUser) ? '不能修改自己的状态' : '当前角色没有修改用户状态的权限'}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                取消
              </Button>
              <Button disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
                {updateMutation.isPending ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Suspend/Activate Confirmation Dialog */}
      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmAction?.type === 'suspend' ? '停用用户' : '激活用户'}</DialogTitle>
            <DialogDescription>
              {confirmAction?.type === 'suspend'
                ? `确认停用用户 ${confirmAction.user.email}？停用后该用户将无法登录。`
                : `确认激活用户 ${confirmAction?.user.email}？激活后该用户可正常登录。`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              取消
            </Button>
            <Button
              variant={confirmAction?.type === 'suspend' ? 'destructive' : 'default'}
              disabled={suspendMutation.isPending || activateMutation.isPending}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.type === 'suspend') {
                  suspendMutation.mutate(confirmAction.user.id);
                } else {
                  activateMutation.mutate(confirmAction.user.id);
                }
              }}
            >
              {suspendMutation.isPending || activateMutation.isPending
                ? '处理中...'
                : confirmAction?.type === 'suspend'
                  ? '确认停用'
                  : '确认激活'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Confirmation Dialog */}
      <Dialog open={!!resetConfirm} onOpenChange={() => setResetConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>
              确认为用户 {resetConfirm?.email} 重置密码？重置后将生成一个临时密码。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setResetConfirm(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={resetMutation.isPending}
              onClick={() => {
                if (resetConfirm) resetMutation.mutate(resetConfirm.id);
              }}
            >
              {resetMutation.isPending ? '重置中...' : '确认重置'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Temporary Password Display Dialog */}
      <Dialog open={!!tempPassword} onOpenChange={() => setTempPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>密码已重置</DialogTitle>
            <DialogDescription>
              用户 {tempPassword?.email} 的临时密码如下，请妥善传达给用户。此密码仅显示一次。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
            <p className="font-mono text-lg font-bold tracking-widest select-all">
              {tempPassword?.password}
            </p>
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={() => setTempPassword(null)}>关闭</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserDetailPanel({ detail }: { detail: AdminUserDetail }) {
  const { activity } = detail;
  const grantHref = `/admin/licenses?grantUserEmail=${encodeURIComponent(detail.email)}`;

  const orderColumns: Column<HydratedOrder>[] = [
    {
      key: 'orderNo',
      header: '订单号',
      cell: (row) => <span className="font-mono text-[11px]">{row.orderNo}</span>,
    },
    {
      key: 'product',
      header: '产品',
      cell: (row) => (
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
      header: '状态',
      cell: (row) => (
        <StatusPill tone={statusToTone(row.status)} label={orderStatusLabel(row.status)} />
      ),
    },
    {
      key: 'amount',
      header: '金额',
      cell: (row) => (
        <span className="text-[11px] font-medium tabular-nums">
          {formatAmount(row.amount, row.currency)}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: '创建时间',
      cell: (row) => (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '跳转',
      className: 'w-[76px]',
      cell: (row) => (
        <Button size="sm" variant="outline" asChild className="h-7 px-2 text-xs">
          <Link to={adminSearchHref('/admin/orders', row.orderNo)}>
            查看
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Button>
      ),
    },
  ];

  const entitlementColumns: Column<HydratedEntitlement>[] = [
    {
      key: 'app',
      header: '应用',
      cell: (row) => row.app?.name ?? row.appId,
    },
    {
      key: 'plan',
      header: '套餐',
      cell: (row) => (
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
      header: '状态',
      cell: (row) => (
        <StatusPill tone={statusToTone(row.status)} label={entitlementStatusLabel(row.status)} />
      ),
    },
    {
      key: 'expiresAt',
      header: '到期时间',
      cell: (row) => (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatTime(row.expiresAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '处置',
      className: 'w-[76px]',
      cell: (row) => (
        <Button size="sm" variant="outline" asChild className="h-7 px-2 text-xs">
          <Link to={adminSearchHref('/admin/licenses', row.id)}>
            查看
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Button>
      ),
    },
  ];

  const installColumns: Column<HydratedInstall>[] = [
    {
      key: 'install',
      header: '客户端安装',
      cell: (row) => <span className="font-mono text-[11px]">{row.extensionInstallId}</span>,
    },
    {
      key: 'app',
      header: '应用',
      cell: (row) => row.app?.name ?? '—',
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => (
        <StatusPill tone={statusToTone(row.status)} label={recordStatusLabel(row.status)} />
      ),
    },
    {
      key: 'lastSeenAt',
      header: '最后活跃',
      cell: (row) => (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatTime(row.lastSeenAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '跳转',
      className: 'w-[76px]',
      cell: (row) => (
        <Button size="sm" variant="outline" asChild className="h-7 px-2 text-xs">
          <Link to={adminSearchHref('/admin/installs', row.extensionInstallId)}>
            查看
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Button>
      ),
    },
  ];

  const eventColumns: Column<AdminEvent>[] = [
    {
      key: 'eventName',
      header: '事件',
      cell: (row) => <span className="font-mono text-[11px]">{row.eventName}</span>,
    },
    {
      key: 'appId',
      header: '应用',
      cell: (row) => <span className="font-mono text-[11px]">{row.appId ?? '—'}</span>,
    },
    {
      key: 'installId',
      header: '安装',
      cell: (row) => <span className="font-mono text-[11px]">{row.installId ?? '—'}</span>,
    },
    {
      key: 'eventTime',
      header: '发生时间',
      cell: (row) => (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatTime(row.eventTime)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '跳转',
      className: 'w-[76px]',
      cell: (row) => (
        <Button size="sm" variant="outline" asChild className="h-7 px-2 text-xs">
          <Link to={observabilityHref('events', row.eventName)}>
            查看
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Button>
      ),
    },
  ];

  const auditColumns: Column<AuditLog>[] = [
    {
      key: 'action',
      header: '动作',
      cell: (row) => <span className="font-mono text-[11px]">{row.action}</span>,
    },
    {
      key: 'resource',
      header: '资源',
      cell: (row) => (
        <span className="font-mono text-[11px]">
          {row.resourceType}/{row.resourceId ?? '—'}
        </span>
      ),
    },
    {
      key: 'outcome',
      header: '结果',
      cell: (row) => <StatusPill tone={statusToTone(row.outcome)} label={row.outcome} />,
    },
    {
      key: 'createdAt',
      header: '时间',
      cell: (row) => (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '跳转',
      className: 'w-[76px]',
      cell: (row) => (
        <Button size="sm" variant="outline" asChild className="h-7 px-2 text-xs">
          <Link to={observabilityHref('audits', row.action)}>
            查看
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Button>
      ),
    },
  ];

  const ticketColumns: Column<HydratedSupportTicket>[] = [
    {
      key: 'ticketNo',
      header: '工单号',
      cell: (row) => (
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
      header: '状态',
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill tone={ticketStatusTone(row.status)} label={ticketStatusLabel(row.status)} />
          <StatusPill tone="neutral" label={row.category} />
        </div>
      ),
    },
    {
      key: 'context',
      header: '关联',
      cell: (row) => (
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
      header: '最近活动',
      cell: (row) => (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatTime(row.lastActivityAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '处置',
      className: 'w-[76px]',
      cell: (row) => (
        <Button size="sm" variant="outline" asChild className="h-7 px-2 text-xs">
          <Link to={adminSearchHref('/admin/tickets', row.ticketNo)}>
            查看
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Button>
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
            <StatusPill
              tone={detail.role === 'admin' ? 'ok' : detail.role === 'user' ? 'neutral' : 'info'}
              label={roleLabels[(detail.role as AppRole) ?? 'user'] ?? detail.role}
            />
          }
        />
        <InfoBlock
          label="账户状态"
          render={
            <StatusPill
              tone={statusToTone(detail.status)}
              label={recordStatusLabel(detail.status)}
            />
          }
        />
        <InfoBlock
          label="邮箱验证"
          render={
            <StatusPill
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
        <DataTable
          columns={orderColumns}
          data={activity.orders}
          getRowKey={(row) => row.id}
          emptyMessage="暂无订单"
        />
      </DetailSection>

      <DetailSection title={`最近授权 (${activity.entitlements.length})`}>
        <DataTable
          columns={entitlementColumns}
          data={activity.entitlements}
          getRowKey={(row) => row.id}
          emptyMessage="暂无授权"
        />
      </DetailSection>

      <DetailSection title={`客户端安装 (${activity.installs.length})`}>
        <DataTable
          columns={installColumns}
          data={activity.installs}
          getRowKey={(row) => row.id}
          emptyMessage="暂无客户端安装"
        />
      </DetailSection>

      <DetailSection title={`最近工单 (${activity.tickets.length})`}>
        <DataTable
          columns={ticketColumns}
          data={activity.tickets}
          getRowKey={(row) => row.id}
          emptyMessage="暂无工单"
        />
      </DetailSection>

      <DetailSection title={`最近事件 (${activity.events.length})`}>
        <DataTable
          columns={eventColumns}
          data={activity.events}
          getRowKey={(row) => row.id}
          emptyMessage="暂无事件"
        />
      </DetailSection>

      <DetailSection title={`审计日志 (${activity.auditLogs.length})`}>
        <DataTable
          columns={auditColumns}
          data={activity.auditLogs}
          getRowKey={(row) => row.id}
          emptyMessage="暂无审计日志"
        />
      </DetailSection>
    </div>
  );
}

function ActionLink({ to, label }: { to: string; label: string }) {
  return (
    <Button size="sm" variant="outline" asChild className="h-8 text-xs">
      <Link to={to}>
        {label}
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    </Button>
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
