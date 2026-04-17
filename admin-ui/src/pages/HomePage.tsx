import { useQuery } from '@tanstack/react-query';
import { Boxes, CreditCard, Layers3, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { listApps } from '@/api/apps';
import { AppCard } from '@/components/portal/AppCard';
import { EmptyState } from '@/components/portal/EmptyState';
import { Button } from '@/components/ui/button';
import { getActiveOffers } from '@/lib/app-catalog-ui';
import { cn } from '@/lib/utils';

export function HomePage() {
  const { data, isLoading } = useQuery({ queryKey: ['public-apps'], queryFn: listApps });
  const apps = data?.items ?? [];

  const [activeCategory, setActiveCategory] = useState<string>('');

  const categories = useMemo(
    () => Array.from(new Set(apps.map((app) => app.category).filter(Boolean))) as string[],
    [apps],
  );

  const filteredApps = useMemo(
    () =>
      activeCategory ? apps.filter((app) => app.category === activeCategory) : apps,
    [activeCategory, apps],
  );

  const activeOfferCount = apps.filter((app) => getActiveOffers(app.checkoutOffers ?? []).length > 0).length;

  return (
    <div className="space-y-8">
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

      <section className="relative overflow-hidden rounded-[32px] border border-gray-200 bg-white/90 px-6 py-8 shadow-sm sm:px-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-slate-100 via-sky-50/70 to-transparent" />

        <div className="relative">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm text-gray-500">当前筛选结果共 {filteredApps.length} 个应用</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
                {activeCategory ? `${activeCategory} 应用` : '全部应用'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                卡片、标签和价格信息采用统一展示标准，便于快速比较和进入详情。
              </p>
            </div>
          </div>

          <div className="-mx-1 mt-6 flex gap-3 overflow-x-auto px-1 pb-1">
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
              推荐
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

          <div className="mt-8">
            {isLoading ? (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
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
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                {filteredApps.map((app) => (
                  <AppCard key={app.id} app={app} href={`/apps/${app.code}`} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
