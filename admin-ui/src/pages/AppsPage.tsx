import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, FileEdit, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { archiveApp, listAppsAdmin, purgeAppConfiguration } from '@/api/apps';
import type { AppWithDetails } from '@/api/types';
import { formatPlanInterval, formatPriceYuan } from '@/components/apps/app-edit/model';
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function normalizeMeta(meta: unknown) {
  return meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {};
}

function replaceAppInList(current: { items: AppWithDetails[] } | undefined, next: AppWithDetails) {
  const items = (current?.items ?? []).filter((item) => {
    const meta = normalizeMeta(item.meta);
    return !(typeof meta.deletedAt === 'string' && meta.deletedAt.trim());
  });
  const existingIndex = items.findIndex((item) => item.id === next.id || item.code === next.code);
  const nextMeta = normalizeMeta(next.meta);
  const nextDeleted = typeof nextMeta.deletedAt === 'string' && nextMeta.deletedAt.trim();

  if (nextDeleted) {
    return {
      items: items.filter((item) => item.id !== next.id && item.code !== next.code),
    };
  }

  if (existingIndex === -1) {
    return { items: [next, ...items] };
  }

  return {
    items: items.map((item, index) => (index === existingIndex ? next : item)),
  };
}

function getLifecycleState(app: AppWithDetails) {
  const meta = normalizeMeta(app.meta);
  const deletedAt = typeof meta.deletedAt === 'string' ? meta.deletedAt.trim() : '';
  const archivedAt = typeof meta.archivedAt === 'string' ? meta.archivedAt.trim() : '';

  if (deletedAt) {
    return { label: '配置已删除', tone: 'danger' as const };
  }

  if (archivedAt || app.status === 'inactive') {
    return { label: '已归档', tone: 'warn' as const };
  }

  return null;
}

type PendingDangerAction =
  | { kind: 'archive'; app: AppWithDetails }
  | { kind: 'purge'; app: AppWithDetails }
  | null;

export function AppsPage() {
  const qc = useQueryClient();
  const [pendingDangerAction, setPendingDangerAction] = useState<PendingDangerAction>(null);
  const [confirmAppCode, setConfirmAppCode] = useState('');

  const { data: appsData, isLoading: isAppsLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: listAppsAdmin,
  });

  const apps = useMemo(
    () =>
      (appsData?.items ?? []).filter((app) => {
        const meta = normalizeMeta(app.meta);
        return !(typeof meta.deletedAt === 'string' && meta.deletedAt.trim());
      }),
    [appsData?.items],
  );
  const lifecycleAppCode = pendingDangerAction?.app.code ?? '';
  const purgeConfirmMatched =
    pendingDangerAction?.kind !== 'purge' || confirmAppCode.trim() === lifecycleAppCode;

  const archiveMutation = useMutation({
    mutationFn: (appCode: string) => archiveApp(appCode),
    onSuccess: (result) => {
      qc.setQueryData<{ items: AppWithDetails[] } | undefined>(['apps'], (current) =>
        replaceAppInList(current, result),
      );
      void qc.invalidateQueries({ queryKey: ['apps'] });
      setPendingDangerAction(null);
      toast.success('应用已停用归档');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '停用应用失败');
    },
  });

  const purgeMutation = useMutation({
    mutationFn: ({ appCode, confirmedCode }: { appCode: string; confirmedCode: string }) =>
      purgeAppConfiguration(appCode, confirmedCode),
    onSuccess: (result) => {
      qc.setQueryData<{ items: AppWithDetails[] } | undefined>(['apps'], (current) =>
        replaceAppInList(current, result),
      );
      void qc.invalidateQueries({ queryKey: ['apps'] });
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      setPendingDangerAction(null);
      setConfirmAppCode('');
      toast.success('应用配置已清空，经营历史已保留');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '清空应用配置失败');
    },
  });

  const isDangerPending = archiveMutation.isPending || purgeMutation.isPending;
  const dangerDialogTitle = useMemo(() => {
    if (!pendingDangerAction) {
      return '';
    }

    if (pendingDangerAction.kind === 'archive') {
      return `停用应用 ${pendingDangerAction.app.name}？`;
    }

    return `永久删除 ${pendingDangerAction.app.name} 的配置？`;
  }, [pendingDangerAction]);

  const dangerDialogDescription = useMemo(() => {
    if (!pendingDangerAction) {
      return '';
    }

    if (pendingDangerAction.kind === 'archive') {
      return '应用会从用户侧下架，历史订单、订阅、部署、事件和用户数据会继续保留。';
    }

    return '会停用应用，并清空展示内容、功能映射、Offers、密钥和交付配置。订单、结账、订阅、部署、事件和用户数据不会删除。';
  }, [pendingDangerAction]);

  const appColumns: Column<AppWithDetails>[] = [
    {
      key: 'name',
      header: '应用',
      cell: (row) => (
        <div>
          <p className="text-sm font-bold">{row.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.code}</p>
          {row.tagline ? (
            <p className="mt-0.5 max-w-[280px] truncate text-xs text-muted-foreground">
              {row.tagline}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: '类型/状态',
      cell: (row) => {
        const lifecycleState = getLifecycleState(row);

        return (
          <div className="flex flex-col gap-1.5">
            <StatusPill tone="neutral" label={row.type} />
            <StatusPill tone={statusToTone(row.status)} label={row.status} />
            {lifecycleState ? (
              <StatusPill tone={lifecycleState.tone} label={lifecycleState.label} />
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'catalog',
      header: '功能 / 套餐 / Offers',
      cell: (row) => (
        <div className="space-y-2 text-xs">
          <p className="text-muted-foreground">
            {row.features.length} Features · {row.plans.length} Plans · {row.checkoutOffers.length} Offers
          </p>
          {row.checkoutOffers.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {row.checkoutOffers.slice(0, 3).map((offer) => (
                <span
                  key={offer.code}
                  className={`rounded border px-1.5 py-0.5 font-mono ${
                    offer.isDefault
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-emerald-100 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {offer.title} ¥{formatPriceYuan(offer.priceAmount)}/{formatPlanInterval(offer.interval)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">未配置 Offer</p>
          )}
        </div>
      ),
    },
    {
      key: 'secrets',
      header: 'Secrets',
      cell: (row) => {
        const activeCount =
          row.secrets?.filter(
            (secret) => !secret.expiresAt || new Date(secret.expiresAt) > new Date(),
          ).length ?? 0;

        return <span className="text-xs text-muted-foreground">{activeCount} 个有效</span>;
      },
    },
    {
      key: 'actions',
      header: '操作',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/admin/apps/${row.code}/edit`}>
              <FileEdit className="mr-1 h-3.5 w-3.5" />
              编辑详情
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setPendingDangerAction({ kind: 'archive', app: row });
                  setConfirmAppCode('');
                }}
              >
                <Archive className="mr-2 h-4 w-4" />
                停用归档
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  setPendingDangerAction({ kind: 'purge', app: row });
                  setConfirmAppCode('');
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                永久删除配置
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="p-6">
        <h1 className="text-2xl font-semibold tracking-tight">应用管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          新建应用会进入完整配置页，直接填写 App Code、功能、套餐和 Offers。
        </p>
      </div>

      <div className="p-6 pt-0">
        <div className="mb-4 flex items-center justify-end">
          <Button size="sm" asChild>
            <Link to="/admin/apps/new">
              <Plus className="mr-1 h-4 w-4" />
              新建应用
            </Link>
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <DataTable
            columns={appColumns}
            data={apps}
            isLoading={isAppsLoading}
            emptyMessage="暂无应用"
            getRowKey={(row) => row.id}
          />
        </div>
      </div>

      <ConfirmActionDialog
        open={Boolean(pendingDangerAction)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDangerAction(null);
            setConfirmAppCode('');
          }
        }}
        onCancel={() => {
          setPendingDangerAction(null);
          setConfirmAppCode('');
        }}
        title={dangerDialogTitle}
        description={dangerDialogDescription}
        confirmText={pendingDangerAction?.kind === 'archive' ? '确认停用' : '确认删除配置'}
        confirmVariant="destructive"
        confirmDisabled={!purgeConfirmMatched}
        isConfirming={isDangerPending}
        onConfirm={() => {
          if (!pendingDangerAction) {
            return;
          }

          if (pendingDangerAction.kind === 'archive') {
            archiveMutation.mutate(pendingDangerAction.app.code);
            return;
          }

          purgeMutation.mutate({
            appCode: pendingDangerAction.app.code,
            confirmedCode: confirmAppCode.trim(),
          });
        }}
      >
        {pendingDangerAction?.kind === 'purge' ? (
          <div className="space-y-4 rounded-md border border-red-200 bg-red-50 p-4">
            <div className="space-y-1 text-sm text-red-700">
              <p>会清空：展示内容、Features、Offers、Secrets、Delivery Settings。</p>
              <p>会保留但停用：应用主体、Plans、订单、结账、订阅、部署、事件、用户数据。</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="purge-app-confirm-code">输入 App Code 继续</Label>
              <Input
                id="purge-app-confirm-code"
                value={confirmAppCode}
                onChange={(event) => setConfirmAppCode(event.target.value)}
                placeholder={pendingDangerAction.app.code}
                autoComplete="off"
              />
            </div>
          </div>
        ) : null}
      </ConfirmActionDialog>
    </div>
  );
}
