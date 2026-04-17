import { useQuery } from '@tanstack/react-query';
import { Boxes, ChevronLeft, ChevronRight, CreditCard, Layers3, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { AppWithDetails } from '@/api/types';
import { listApps } from '@/api/apps';
import { AppCard } from '@/components/portal/AppCard';
import { EmptyState } from '@/components/portal/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatOfferPriceLabel,
  getActiveOffers,
  getAppTypeLabel,
  getPreferredOffer,
} from '@/lib/app-catalog-ui';
import { cn, getInitials } from '@/lib/utils';

function rankAppsByHeat(items: AppWithDetails[]) {
  return [...items].sort((left, right) => {
    const leftOffers = getActiveOffers(left.checkoutOffers ?? []).length;
    const rightOffers = getActiveOffers(right.checkoutOffers ?? []).length;
    if (leftOffers !== rightOffers) {
      return rightOffers - leftOffers;
    }

    if (left.highlights.length !== right.highlights.length) {
      return right.highlights.length - left.highlights.length;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export function HomePage() {
  const { data, isLoading } = useQuery({ queryKey: ['public-apps'], queryFn: listApps });
  const apps = data?.items ?? [];

  const [activeCategory, setActiveCategory] = useState<string>('');
  const [activeHotIndex, setActiveHotIndex] = useState(0);

  const categories = useMemo(
    () => Array.from(new Set(apps.map((app) => app.category).filter(Boolean))) as string[],
    [apps],
  );

  const filteredApps = useMemo(
    () => (activeCategory ? apps.filter((app) => app.category === activeCategory) : apps),
    [activeCategory, apps],
  );

  const hotApps = useMemo(() => rankAppsByHeat(filteredApps).slice(0, 5), [filteredApps]);

  useEffect(() => {
    if (hotApps.length === 0) {
      setActiveHotIndex(0);
      return;
    }

    if (activeHotIndex >= hotApps.length) {
      setActiveHotIndex(0);
    }
  }, [activeHotIndex, hotApps.length]);

  const activeHotApp = hotApps[activeHotIndex] ?? null;
  const activeOfferCount = apps.filter((app) => getActiveOffers(app.checkoutOffers ?? []).length > 0).length;

  const moveHotIndex = (direction: -1 | 1) => {
    if (!hotApps.length) {
      return;
    }
    setActiveHotIndex((current) => {
      const next = current + direction;
      if (next < 0) {
        return hotApps.length - 1;
      }
      if (next >= hotApps.length) {
        return 0;
      }
      return next;
    });
  };

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/85 px-6 py-8 shadow-sm sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.18),_transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.95),rgba(255,255,255,0.84))]" />

        <div className="relative space-y-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
              <Sparkles className="h-3.5 w-3.5" />
              App Center
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
              应用中心
            </h1>
            <p className="mt-4 text-base leading-7 text-gray-600 sm:text-lg">
              统一以应用发现、筛选、详情和购买为主线，帮助你更快找到合适的产品。
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: Layers3,
                label: '应用总数',
                value: String(apps.length),
                note: '当前可浏览的全部应用',
              },
              {
                icon: CreditCard,
                label: '可购应用',
                value: String(activeOfferCount),
                note: '已配置可直接购买的方案',
              },
              {
                icon: Boxes,
                label: '分类数量',
                value: String(categories.length),
                note: '支持按分类切换浏览',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="rounded-[24px] border border-gray-200/80 bg-white/90 p-5 shadow-sm"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
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

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/access">查看我的应用</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/orders">查看订单</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-gray-500">根据方案数量、亮点和更新时间排序</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
              热门应用
            </h2>
          </div>

          {hotApps.length > 1 ? (
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" onClick={() => moveHotIndex(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={() => moveHotIndex(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr),300px]">
            <div className="rounded-[28px] border border-gray-200 bg-white p-8">
              <div className="h-8 w-40 animate-pulse rounded bg-gray-100" />
              <div className="mt-4 h-5 w-3/4 animate-pulse rounded bg-gray-100" />
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
              ))}
            </div>
          </div>
        ) : activeHotApp ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr),300px]">
            <article className="relative overflow-hidden rounded-[28px] border border-gray-200 bg-white">
              {activeHotApp.coverUrl ? (
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-10"
                  style={{ backgroundImage: `url(${activeHotApp.coverUrl})` }}
                />
              ) : null}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.16),_transparent_35%),linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))]" />

              <div className="relative grid gap-8 p-6 md:p-8 xl:grid-cols-[minmax(0,1fr),240px]">
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-2">
                    {activeHotApp.category ? (
                      <Badge className="bg-sky-50 text-sky-700 hover:bg-sky-50">
                        {activeHotApp.category}
                      </Badge>
                    ) : null}
                    <Badge className="bg-white text-gray-700 hover:bg-white">
                      {getAppTypeLabel(activeHotApp.type)}
                    </Badge>
                    <Badge className="bg-white text-gray-700 hover:bg-white">
                      热门推荐
                    </Badge>
                  </div>

                  <div className="flex flex-col gap-5 md:flex-row md:items-start">
                    {activeHotApp.iconUrl ? (
                      <img
                        src={activeHotApp.iconUrl}
                        alt={activeHotApp.name}
                        className="h-24 w-24 rounded-[22%] border border-gray-100 bg-white object-contain shadow-md"
                      />
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-[22%] border border-gray-100 bg-white text-3xl font-semibold text-gray-400 shadow-md">
                        {getInitials(activeHotApp.name)}
                      </div>
                    )}

                    <div className="min-w-0">
                      <h3 className="text-3xl font-semibold tracking-tight text-gray-900">
                        {activeHotApp.name}
                      </h3>
                      <p className="mt-3 max-w-2xl text-base leading-7 text-gray-600">
                        {activeHotApp.tagline || activeHotApp.description || '高质量应用入口。'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600">
                      {activeHotApp.highlights.length} 项亮点
                    </span>
                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600">
                      {getActiveOffers(activeHotApp.checkoutOffers ?? []).length} 个在售方案
                    </span>
                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600">
                      {activeHotApp.links.length} 个资源入口
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button asChild>
                      <Link to={`/apps/${activeHotApp.code}`}>查看详情</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link to="/access">查看我的应用</Link>
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  {[
                    {
                      label: '起始价格',
                      value: formatOfferPriceLabel(getPreferredOffer(activeHotApp.checkoutOffers ?? [])),
                      note: '面向当前在售方案',
                    },
                    {
                      label: '方案数量',
                      value: String(getActiveOffers(activeHotApp.checkoutOffers ?? []).length),
                      note: '支持不同使用场景',
                    },
                    {
                      label: '信息密度',
                      value: `${activeHotApp.highlights.length + activeHotApp.links.length}`,
                      note: '亮点与资源入口总数',
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
                        {item.label}
                      </p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{item.value}</p>
                      <p className="mt-2 text-sm leading-6 text-gray-500">{item.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {hotApps.map((app, index) => {
                const preferredOffer = getPreferredOffer(app.checkoutOffers ?? []);
                const isActive = index === activeHotIndex;

                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => setActiveHotIndex(index)}
                    className={cn(
                      'rounded-2xl border p-4 text-left transition-colors',
                      isActive
                        ? 'border-sky-200 bg-sky-50/70 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {app.iconUrl ? (
                        <img
                          src={app.iconUrl}
                          alt={app.name}
                          className="h-12 w-12 rounded-2xl border border-gray-100 bg-white object-contain"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-100 bg-white text-sm font-semibold text-gray-400">
                          {getInitials(app.name)}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{app.name}</p>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-gray-500">
                          {app.tagline || app.description || '高质量应用入口。'}
                        </p>
                        <p className="mt-2 text-xs font-medium text-gray-400">
                          {formatOfferPriceLabel(preferredOffer)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Boxes}
            title="暂无热门应用"
            description="当前筛选条件下还没有可展示的热门应用。"
          />
        )}
      </section>

      <section className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-gray-500">当前筛选结果共 {filteredApps.length} 个应用</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
              应用列表
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              当前结果按分类切换浏览，卡片宽度也调整为更适合比较信息的三列布局。
            </p>
          </div>
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
            全部应用
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

        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-[28px] border border-gray-200 bg-white p-6"
              >
                <div className="mx-auto h-24 w-24 animate-pulse rounded-[22%] bg-gray-100" />
                <div className="mx-auto mt-5 h-4 w-24 animate-pulse rounded bg-gray-100" />
                <div className="mx-auto mt-4 h-4 w-40 animate-pulse rounded bg-gray-100" />
                <div className="mx-auto mt-2 h-4 w-32 animate-pulse rounded bg-gray-100" />
                <div className="mx-auto mt-6 h-8 w-28 animate-pulse rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : filteredApps.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="暂无应用"
            description="当前筛选条件下还没有应用，请切换分类后再查看。"
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {filteredApps.map((app) => (
              <AppCard key={app.id} app={app} href={`/apps/${app.code}`} className="h-full" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
