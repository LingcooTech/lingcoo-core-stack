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
import { AppCard } from '@/components/portal/AppCard';
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
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
import {
  formatOfferPriceLabel,
  getActiveOffers,
  getAppTypeLabel,
  getPreferredOffer,
} from '@/lib/app-catalog-ui';
import { formatPlanInterval } from '@/lib/catalog-utils';
import { cn } from '@/lib/utils';

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
  const [searchValue, setSearchValue] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
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
      const matchesCategory = !activeCategory || app.category === activeCategory;
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

  return (
    <div className="space-y-8 p-6">
      <section className="relative overflow-hidden rounded-[32px] border border-gray-200 bg-white px-6 py-8 shadow-sm sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.16),_transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,255,255,0.94))]" />

        <div className="relative space-y-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
                <Sparkles className="h-3.5 w-3.5" />
                App Library
              </div>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-gray-900">应用列表</h1>
              <p className="mt-4 text-base leading-7 text-gray-600">
                用统一卡片视图管理应用，同时保留编辑、预览、归档与清配置等后台动作。
              </p>
            </div>

            <Button asChild size="lg">
              <Link to="/admin/apps/new">
                <Plus className="h-4 w-4" />
                新建应用
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {[
              { icon: Boxes, label: '应用总数', value: String(apps.length), note: '全部未删除应用' },
              { icon: Sparkles, label: '已上架', value: String(publishedCount), note: '仍在前台展示的应用' },
              { icon: Archive, label: '已归档', value: String(archivedCount), note: '已下架但历史保留' },
              { icon: CreditCard, label: '可购应用', value: String(activeOfferCount), note: '存在活动 Offer' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-[24px] border border-gray-200 bg-gray-50/80 p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sky-700 shadow-sm">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.1em] text-gray-400">
                    {item.label}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">{item.value}</p>
                  <p className="mt-2 text-sm leading-6 text-gray-500">{item.note}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[32px] border border-gray-200 bg-white px-6 py-8 shadow-sm sm:px-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-slate-100 via-sky-50/60 to-transparent" />

        <div className="relative space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm text-gray-500">当前结果 {filteredApps.length} 个应用</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">
                {activeCategory ? `${activeCategory} · 应用列表` : '全部应用'}
              </h2>
            </div>

            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="搜索应用名称、Code 或一句话介绍"
                className="h-11 rounded-full border-gray-200 pl-11"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {[
              { key: 'all', label: '全部' },
              { key: 'active', label: '已上架' },
              { key: 'archived', label: '已归档' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveState(item.key as typeof activeState)}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  activeState === item.key
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
            <button
              type="button"
              onClick={() => setActiveCategory('')}
              className={cn(
                'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                activeCategory === ''
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900',
              )}
            >
              全部分类
            </button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={cn(
                  'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  activeCategory === category
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900',
                )}
              >
                {category}
              </button>
            ))}
          </div>

          {isAppsLoading ? (
            <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="overflow-hidden rounded-[28px] border border-gray-200 bg-white p-6"
                >
                  <div className="mx-auto h-24 w-24 animate-pulse rounded-[22%] bg-gray-100" />
                  <div className="mx-auto mt-5 h-4 w-28 animate-pulse rounded bg-gray-100" />
                  <div className="mx-auto mt-4 h-4 w-44 animate-pulse rounded bg-gray-100" />
                  <div className="mx-auto mt-2 h-4 w-32 animate-pulse rounded bg-gray-100" />
                  <div className="mt-8 grid grid-cols-2 gap-3">
                    <div className="h-16 animate-pulse rounded-2xl bg-gray-100" />
                    <div className="h-16 animate-pulse rounded-2xl bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-gray-200 bg-gray-50/70">
              <div className="px-6 py-12">
                <p className="text-center text-sm text-gray-500">没有符合筛选条件的应用。</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
              {filteredApps.map((app) => {
                const lifecycleState = getLifecycleState(app);
                const activeOffers = getActiveOffers(app.checkoutOffers ?? []);
                const preferredOffer = getPreferredOffer(activeOffers);

                return (
                  <AppCard
                    key={app.id}
                    app={app}
                    href={`/apps/${app.code}`}
                    footer={
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'App Code', value: app.code, mono: true },
                            { label: '应用类型', value: getAppTypeLabel(app.type) },
                            { label: '功能 / 套餐', value: `${app.features.length} / ${app.plans.length}` },
                            {
                              label: '当前价格',
                              value: formatOfferPriceLabel(preferredOffer),
                            },
                          ].map((item) => (
                            <div key={item.label} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                                {item.label}
                              </p>
                              <p
                                className={cn(
                                  'mt-1 text-sm font-semibold text-gray-900',
                                  item.mono && 'font-mono text-xs',
                                )}
                              >
                                {item.value}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <StatusPill tone="neutral" label={getAppTypeLabel(app.type)} />
                          <StatusPill tone={statusToTone(app.status)} label={app.status} />
                          {lifecycleState ? (
                            <StatusPill tone={lifecycleState.tone} label={lifecycleState.label} />
                          ) : null}
                        </div>

                        {activeOffers.length > 0 ? (
                          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                              活动 Offer
                            </p>
                            <div className="mt-3 space-y-2">
                              {activeOffers.slice(0, 2).map((offer) => (
                                <div
                                  key={offer.code}
                                  className="flex items-center justify-between gap-3 text-sm"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-gray-900">{offer.title}</p>
                                    <p className="text-xs text-gray-500">
                                      {formatPlanInterval(offer.interval)}
                                    </p>
                                  </div>
                                  <p className="shrink-0 font-semibold text-gray-900">
                                    {formatOfferPriceLabel(offer)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link to={`/apps/${app.code}`} target="_blank" rel="noreferrer">
                              预览详情
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <Button size="sm" asChild>
                            <Link to={`/admin/apps/${app.code}/edit`}>
                              <FileEdit className="h-3.5 w-3.5" />
                              编辑详情
                            </Link>
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="ml-auto h-9 w-9 rounded-full">
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
                      </div>
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
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
