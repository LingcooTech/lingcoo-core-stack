import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Boxes,
  CreditCard,
  ExternalLink,
  FileEdit,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { archiveApp, listAppsAdmin, purgeAppConfiguration } from '@/api/apps';
import type { AppWithDetails } from '@/api/types';
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  formatOfferPriceLabel,
  getActiveOffers,
  getAppStatusLabel,
  getAppTypeLabel,
  getPreferredOffer,
} from '@/lib/app-catalog-ui';
import { formatPlanInterval } from '@/lib/catalog-utils';
import { getInitials } from '@/lib/utils';

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

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function AppsTableSkeleton() {
  return (
    <TableBody>
      {Array.from({ length: 6 }).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array.from({ length: 7 }).map((__, cellIndex) => (
            <TableCell key={cellIndex}>
              <div
                className="h-4 animate-pulse rounded bg-slate-100"
                style={{ width: `${60 + ((rowIndex + cellIndex) % 4) * 10}%` }}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}

type PendingDangerAction =
  | { kind: 'archive'; app: AppWithDetails }
  | { kind: 'purge'; app: AppWithDetails }
  | null;

export function AppsPage() {
  const qc = useQueryClient();
  const [pendingDangerAction, setPendingDangerAction] = useState<PendingDangerAction>(null);
  const [confirmAppCode, setConfirmAppCode] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeState, setActiveState] = useState<'all' | 'active' | 'archived'>('all');

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

  const categories = useMemo(
    () => Array.from(new Set(apps.map((app) => app.category).filter(Boolean))) as string[],
    [apps],
  );

  const filteredApps = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();

    return apps.filter((app) => {
      const lifecycleState = getLifecycleState(app);
      const matchesKeyword =
        !keyword ||
        app.name.toLowerCase().includes(keyword) ||
        app.code.toLowerCase().includes(keyword) ||
        (app.tagline ?? '').toLowerCase().includes(keyword);
      const matchesCategory = activeCategory === 'all' || app.category === activeCategory;
      const matchesState =
        activeState === 'all'
          ? true
          : activeState === 'archived'
            ? Boolean(lifecycleState)
            : !lifecycleState && app.status === 'active';

      return matchesKeyword && matchesCategory && matchesState;
    });
  }, [activeCategory, activeState, apps, searchValue]);

  const publishedCount = useMemo(
    () => apps.filter((app) => !getLifecycleState(app) && app.status === 'active').length,
    [apps],
  );
  const archivedCount = useMemo(
    () => apps.filter((app) => Boolean(getLifecycleState(app))).length,
    [apps],
  );
  const activeOfferCount = useMemo(
    () => apps.filter((app) => getActiveOffers(app.checkoutOffers ?? []).length > 0).length,
    [apps],
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

  return (
    <div className="space-y-5 p-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Resources</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">应用列表</h1>
        </div>

        <Button asChild>
          <Link to="/admin/apps/new">
            <Plus className="h-4 w-4" />
            新建应用
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-4">
        {[
          { icon: Boxes, label: '应用总数', value: String(apps.length) },
          { icon: Sparkles, label: '已上架', value: String(publishedCount) },
          { icon: Archive, label: '已归档', value: String(archivedCount) },
          { icon: CreditCard, label: '可售卖', value: String(activeOfferCount) },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-lg border border-gray-200 bg-white px-4 py-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{item.value}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-700">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr),180px,160px] xl:w-[760px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="搜索应用名称、Code 或一句话介绍"
                className="h-10 border-gray-200 pl-10"
              />
            </div>

            <Select value={activeCategory} onValueChange={setActiveCategory}>
              <SelectTrigger className="h-10 border-gray-200">
                <SelectValue placeholder="全部分类" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分类</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={activeState} onValueChange={(value) => setActiveState(value as typeof activeState)}>
              <SelectTrigger className="h-10 border-gray-200">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">已上架</SelectItem>
                <SelectItem value="archived">已归档</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>结果 {filteredApps.length}</span>
            <span className="hidden text-gray-300 md:inline">|</span>
            <span className="hidden md:inline">分类 {categories.length}</span>
          </div>
        </div>

        <Table>
          <TableHeader className="bg-slate-50/70">
            <TableRow className="hover:bg-slate-50/70">
              <TableHead className="w-[28%]">应用</TableHead>
              <TableHead className="w-[16%]">分类 / 类型</TableHead>
              <TableHead className="w-[18%]">目录配置</TableHead>
              <TableHead className="w-[16%]">售卖信息</TableHead>
              <TableHead className="w-[12%]">状态</TableHead>
              <TableHead className="w-[10%]">更新时间</TableHead>
              <TableHead className="w-[12%] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>

          {isAppsLoading ? (
            <AppsTableSkeleton />
          ) : (
            <TableBody>
              {filteredApps.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-14 text-center text-sm text-gray-500">
                    没有符合当前筛选条件的应用。
                  </TableCell>
                </TableRow>
              ) : (
                filteredApps.map((app) => {
                  const lifecycleState = getLifecycleState(app);
                  const activeOffers = getActiveOffers(app.checkoutOffers ?? []);
                  const preferredOffer = getPreferredOffer(activeOffers);

                  return (
                    <TableRow key={app.id} className="hover:bg-slate-50/70">
                      <TableCell className="py-4">
                        <div className="flex items-start gap-3">
                          {app.iconUrl ? (
                            <img
                              src={app.iconUrl}
                              alt={app.name}
                              className="h-11 w-11 rounded-xl border border-gray-100 bg-white object-contain"
                            />
                          ) : (
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-100 bg-slate-50 text-sm font-semibold text-gray-400">
                              {getInitials(app.name)}
                            </div>
                          )}

                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">{app.name}</p>
                            <p className="mt-1 font-mono text-xs text-gray-400">{app.code}</p>
                            {app.tagline ? (
                              <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-500">
                                {app.tagline}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-2">
                          {app.category ? (
                            <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                              {app.category}
                            </Badge>
                          ) : (
                            <span className="text-sm text-gray-400">未分类</span>
                          )}
                          <p className="text-sm font-medium text-gray-700">{getAppTypeLabel(app.type)}</p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-2 text-sm text-gray-600">
                          <p>{app.features.length} Features</p>
                          <p>{app.plans.length} Plans</p>
                          <p>{app.checkoutOffers.length} Offers</p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-gray-900">
                            {formatOfferPriceLabel(preferredOffer)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {preferredOffer
                              ? `${preferredOffer.title} · ${formatPlanInterval(preferredOffer.interval)}`
                              : '暂无活动 Offer'}
                          </p>
                          {activeOffers.length > 1 ? (
                            <p className="text-xs text-gray-400">另有 {activeOffers.length - 1} 个活动方案</p>
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <StatusPill tone={statusToTone(app.status)} label={getAppStatusLabel(app.status)} />
                          {lifecycleState ? (
                            <StatusPill tone={lifecycleState.tone} label={lifecycleState.label} />
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell>
                        <p className="text-sm text-gray-600">{formatUpdatedAt(app.updatedAt)}</p>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button size="icon" variant="ghost" asChild>
                            <Link to={`/apps/${app.code}`} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>

                          <Button size="sm" variant="outline" asChild>
                            <Link to={`/admin/apps/${app.code}/edit`}>
                              <FileEdit className="h-3.5 w-3.5" />
                              编辑
                            </Link>
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault();
                                  setPendingDangerAction({ kind: 'archive', app });
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
                                  setPendingDangerAction({ kind: 'purge', app });
                                  setConfirmAppCode('');
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                永久删除配置
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          )}
        </Table>
      </section>

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
        title={
          pendingDangerAction?.kind === 'archive'
            ? `停用应用 ${pendingDangerAction.app.name}？`
            : pendingDangerAction?.kind === 'purge'
              ? `永久删除 ${pendingDangerAction.app.name} 的配置？`
              : ''
        }
        description={
          pendingDangerAction?.kind === 'archive'
            ? '应用会从用户侧下架，历史订单、订阅、部署、事件和用户数据会继续保留。'
            : pendingDangerAction?.kind === 'purge'
              ? '会停用应用，并清空展示内容、功能映射、Offers、密钥和交付配置。订单、结账、订阅、部署、事件和用户数据不会删除。'
              : ''
        }
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
