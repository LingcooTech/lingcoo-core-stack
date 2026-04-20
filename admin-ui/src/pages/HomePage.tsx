import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { AppWithDetails } from '@/api/types';
import { listApps } from '@/api/apps';
import { AppCard } from '@/components/portal/AppCard';
import { EmptyState } from '@/components/portal/EmptyState';
import { SkeletonAppCard } from '@/components/shared/Skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatOfferStartingPriceLabel,
  getActiveOffers,
  getAppTypeLabel,
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

  const hotApps = useMemo(() => rankAppsByHeat(apps).slice(0, 6), [apps]);

  useEffect(() => {
    if (hotApps.length === 0) {
      setActiveHotIndex(0);
      return;
    }

    if (activeHotIndex >= hotApps.length) {
      setActiveHotIndex(0);
    }
  }, [activeHotIndex, hotApps.length]);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        {isLoading ? (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="h-8 w-44 animate-pulse rounded bg-gray-100" />
            <div className="mt-4 h-5 w-2/3 animate-pulse rounded bg-gray-100" />
            <div className="mt-6 grid gap-4 md:grid-cols-[112px,minmax(0,1fr),180px]">
              <div className="h-24 w-24 animate-pulse rounded-[22%] bg-gray-100" />
              <div className="space-y-4">
                <div className="h-5 w-40 animate-pulse rounded bg-gray-100" />
                <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100" />
              </div>
              <div className="h-32 animate-pulse rounded-2xl bg-gray-100" />
            </div>
          </div>
        ) : hotApps.length === 0 ? (
          <EmptyState
            icon={ChevronRight}
            title="暂无热门应用"
            description="当前还没有可展示的热门应用。"
          />
        ) : (
          <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-md">
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${activeHotIndex * 100}%)` }}
              >
                {hotApps.map((app) => {
                  const activeOffers = getActiveOffers(app.checkoutOffers ?? []);
                  const priceLabel = formatOfferStartingPriceLabel(activeOffers);

                  return (
                    <article key={app.id} className="min-w-full">
                      <div className="relative overflow-hidden">
                        {app.coverUrl ? (
                          <div
                            className="absolute inset-0 bg-cover bg-center opacity-8"
                            style={{ backgroundImage: `url(${app.coverUrl})` }}
                          />
                        ) : null}
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-50 via-blue-50/50 to-white" />

                        <div className="relative grid gap-6 p-5 md:p-6 xl:grid-cols-[132px,minmax(0,1fr),220px]">
                          <div className="flex justify-center xl:justify-start">
                            {app.iconUrl ? (
                              <img
                                src={app.iconUrl}
                                alt={app.name}
                                className="h-28 w-28 rounded-[22%] border border-gray-100 bg-white object-contain p-1 shadow-md"
                              />
                            ) : (
                              <div className="flex h-28 w-28 items-center justify-center rounded-[22%] border border-gray-100 bg-white text-3xl font-semibold text-gray-400 shadow-md">
                                {getInitials(app.name)}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 text-center xl:text-left">
                            <div className="flex flex-wrap items-center justify-center gap-2 xl:justify-start">
                              {app.category ? (
                                <Badge className="bg-sky-50 text-sky-700 hover:bg-sky-50">
                                  {app.category}
                                </Badge>
                              ) : null}
                              <Badge className="bg-white text-gray-700 hover:bg-white">
                                {getAppTypeLabel(app.type)}
                              </Badge>
                            </div>

                            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">
                              {app.name}
                            </h2>
                            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-gray-600">
                              {app.tagline || app.description || '高质量应用入口。'}
                            </p>

                            <div className="mt-5 flex flex-wrap justify-center gap-3 xl:justify-start">
                              <Button asChild>
                                <Link to={`/apps/${app.code}`}>查看详情</Link>
                              </Button>
                              <Button variant="outline" asChild>
                                <Link to="/access">查看我的应用</Link>
                              </Button>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-gray-200 bg-white/95 p-5 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">起始价格</p>
                            <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">
                              {priceLabel}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-gray-500">
                              {activeOffers.length > 1 ? `${activeOffers.length} 个套餐可选` : activeOffers.length === 1 ? '当前仅有一个套餐' : '暂无上架中的售卖方案'}
                            </p>
                          </div>
                        </div>

                        {hotApps.length > 1 ? (
                          <div className="flex justify-center gap-2 pb-5">
                            {hotApps.map((_, index) => (
                              <button
                                key={index}
                                type="button"
                                aria-label={`切换到第 ${index + 1} 个应用`}
                                onClick={() => setActiveHotIndex(index)}
                                className={cn(
                                  'h-2.5 rounded-full transition-all',
                                  index === activeHotIndex ? 'w-10 bg-sky-600' : 'w-2.5 bg-gray-300',
                                )}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-5">
        <div className="flex gap-4 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveCategory('')}
            className={cn(
              'shrink-0 rounded-md px-3 py-1.5 text-[15px] transition-colors',
              activeCategory === ''
                ? 'bg-gray-100 text-gray-900 font-medium'
                : 'text-gray-600 hover:text-gray-900',
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
                'shrink-0 rounded-md px-3 py-1.5 text-[15px] transition-colors',
                activeCategory === category
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'text-gray-600 hover:text-gray-900',
              )}
            >
              {category}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="animate-fadeInUp"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <SkeletonAppCard />
              </div>
            ))}
          </div>
        ) : filteredApps.length === 0 ? (
          <EmptyState
            icon={ChevronRight}
            title="暂无应用"
            description="当前筛选条件下还没有应用，请切换分类后再查看。"
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredApps.map((app, index) => (
              <div
                key={app.id}
                className="animate-fadeInUp"
                style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
              >
                <AppCard app={app} href={`/apps/${app.code}`} className="h-full" />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
