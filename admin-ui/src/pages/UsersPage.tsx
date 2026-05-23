import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { listUsers, updateUser, suspendUser, activateUser, resetUserPassword } from '@/api/admin';
import type { AdminUser, AdminUpdateUserInput } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterChipBar, type FilterChipConfig } from '@/components/shared/FilterChipBar';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill } from '@/components/shared/StatusPill';
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
import { useTableState } from '@/hooks/useTableState';
import { useAuth } from '@/lib/auth';
import { formatTime } from '@/lib/utils';

export function UsersPage() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();

  const { search, filters, setSearch, setFilter, clearFilters } = useTableState({
    knownFilters: ['role', 'status'],
  });
  const roleValues = useMemo(() => filters.role ?? [], [filters.role]);
  const statusValues = useMemo(() => filters.status ?? [], [filters.status]);

  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<AdminUpdateUserInput>({});

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

  const updateMutation = useMutation({
    mutationFn: () => updateUser(editingUser!.id, editForm),
    onSuccess: () => {
      toast.success('用户信息已更新');
      setEditOpen(false);
      setEditingUser(null);
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '更新失败'),
  });

  const suspendMutation = useMutation({
    mutationFn: (userId: string) => suspendUser(userId),
    onSuccess: () => {
      toast.success('用户已停用');
      setConfirmAction(null);
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '停用失败'),
  });

  const activateMutation = useMutation({
    mutationFn: (userId: string) => activateUser(userId),
    onSuccess: () => {
      toast.success('用户已激活');
      setConfirmAction(null);
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
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
      role: u.role as 'user' | 'admin',
      status: u.status as 'active' | 'suspended',
    });
    setEditOpen(true);
  }

  const isSelf = (u: AdminUser) => currentUser?.id === u.id;

  const chips: FilterChipConfig[] = [
    {
      id: 'role',
      label: '角色',
      values: roleValues,
      onChange: (next) => setFilter('role', next),
      options: [
        { value: 'admin', label: '管理员' },
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
          <p className="text-foreground truncate text-[12px] font-medium">{row.email}</p>
          {row.displayName ? (
            <p className="text-muted-foreground truncate text-[10px]">{row.displayName}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'role',
      header: '角色',
      cell: (row) => <StatusPill tone={row.role === 'admin' ? 'ok' : 'neutral'} label={row.role} />,
    },
    {
      key: 'status',
      header: '账户 / 邮箱',
      cell: (row) => (
        <div className="inline-flex items-center gap-1.5">
          <StatusPill tone={row.status === 'active' ? 'ok' : 'warn'} label={row.status} />
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
        <span className="text-muted-foreground text-[11px] tabular-nums">
          {formatTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      className: 'w-[220px]',
      cell: (row) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => openEdit(row)}
          >
            编辑
          </Button>
          {row.status === 'active' ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground h-7 px-2 text-xs"
              disabled={isSelf(row)}
              onClick={() => setConfirmAction({ type: 'suspend', user: row })}
            >
              停用
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground h-7 px-2 text-xs"
              onClick={() => setConfirmAction({ type: 'activate', user: row })}
            >
              激活
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive h-7 px-2 text-xs"
            onClick={() => setResetConfirm(row)}
          >
            重置密码
          </Button>
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

        <div className="border-border bg-card overflow-hidden rounded-lg border">
          <DataTable
            columns={columns}
            data={users}
            isLoading={isLoading}
            emptyMessage="暂无用户"
            getRowKey={(row) => row.id}
          />
        </div>
      </div>

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
                onValueChange={(v) =>
                  setEditForm((prev) => ({ ...prev, role: v as 'user' | 'admin' }))
                }
                disabled={editingUser ? isSelf(editingUser) : false}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="user">普通用户</SelectItem>
                </SelectContent>
              </Select>
              {editingUser && isSelf(editingUser) && (
                <p className="text-muted-foreground text-xs">不能修改自己的角色</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select
                value={editForm.status ?? 'active'}
                onValueChange={(v) =>
                  setEditForm((prev) => ({ ...prev, status: v as 'active' | 'suspended' }))
                }
                disabled={editingUser ? isSelf(editingUser) : false}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">活跃</SelectItem>
                  <SelectItem value="suspended">已停用</SelectItem>
                </SelectContent>
              </Select>
              {editingUser && isSelf(editingUser) && (
                <p className="text-muted-foreground text-xs">不能修改自己的状态</p>
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
          <div className="border-border bg-muted/50 rounded-lg border p-4 text-center">
            <p className="select-all font-mono text-lg font-bold tracking-widest">
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
