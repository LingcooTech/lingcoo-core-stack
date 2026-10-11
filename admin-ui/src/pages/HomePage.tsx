import { usePageMetadata } from '@/lib/use-page-metadata';
import { QueryErrorState } from '@/components/portal/QueryErrorState';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { AppWithDetails } from '@/api/types';
import { listApps } from '@/api/apps';
import { AppCard } from '@/components/portal/AppCard';
import { EmptyState } from '@/components/portal/EmptyState';
import { SkeletonAppCard } from '@/components/shared/Skeleton';
import { cn } from '@/lib/utils';

export function HomePage() {
  usePageMetadata('应用中心');
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['public-apps'],
    queryFn: listApps,
  });
  const apps = useMemo(() => data?.items ?? [], [data?.items]);

  const [activeCategory, setActiveCategory] = useState<string>('');

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const app of apps) {
      if (!app.category) continue;
      counts.set(app.category, (counts.get(app.category) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [apps]);

  const filteredApps = useMemo<AppWithDetails[]>(
    () => (activeCategory ? apps.filter((app) => app.category === activeCategory) : apps),
    [activeCategory, apps],
  );

  return (
    <div className="space-y-10 pb-12">
      <HeroSection appCount={apps.length} />

      <CategoryNav
        categories={categories}
        activeCategory={activeCategory}
        onChange={setActiveCategory}
        totalCount={apps.length}
      />

      <section className="space-y-4">
        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonAppCard key={index} />
            ))}
          </div>
        ) : isError ? (
          <QueryErrorState retry={() => void refetch()} busy={isFetching} />
        ) : filteredApps.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="暂无应用"
            description="当前筛选条件下没有应用，请切换分类后再查看。"
            action={
              activeCategory ? (
                <button
                  type="button"
                  onClick={() => setActiveCategory('')}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
                >
                  显示全部应用
                </button>
              ) : null
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredApps.map((app) => (
              <AppCard key={app.id} app={app} href={`/apps/${app.code}`} className="h-full" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function HeroSection({ appCount }: { appCount: number }) {
  return (
    <section className="pt-2">
      <div className="max-w-3xl">
        <div className="inline-flex items-center gap-1.5 text-[12px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          <Sparkles className="h-3.5 w-3.5" />
          FutureDecade 应用工坊
        </div>
        <h1 className="mt-3 text-4xl leading-tight font-semibold tracking-tight text-foreground md:text-5xl">
          挑一款应用，
          <br className="hidden md:inline" />
          立刻开始你的工作流。
        </h1>
        <p className="mt-4 text-[15px] leading-7 text-muted-foreground md:text-base">
          {appCount > 0
            ? `精选 ${appCount} 款经过实战打磨的工具，统一支付、统一授权、统一体验。`
            : '统一支付、统一授权、统一体验。'}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            to="#apps"
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-foreground px-4 text-[13px] font-medium text-background no-underline transition-colors hover:bg-foreground/90"
          >
            浏览应用
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            to="/access"
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-4 text-[13px] font-medium text-foreground no-underline transition-colors hover:bg-muted"
          >
            查看已开通
          </Link>
        </div>
      </div>
    </section>
  );
}

function CategoryNav({
  categories,
  activeCategory,
  onChange,
  totalCount,
}: {
  categories: { name: string; count: number }[];
  activeCategory: string;
  onChange: (value: string) => void;
  totalCount: number;
}) {
  if (categories.length === 0) return null;

  return (
    <nav
      id="apps"
      aria-label="应用分类"
      className="sticky top-12 z-10 -mx-1 flex gap-1 overflow-x-auto border-b border-border bg-background/80 px-1 py-2 backdrop-blur-md"
    >
      <CategoryChip
        label="全部"
        count={totalCount}
        active={activeCategory === ''}
        onClick={() => onChange('')}
      />
      {categories.map((category) => (
        <CategoryChip
          key={category.name}
          label={category.name}
          count={category.count}
          active={activeCategory === category.name}
          onClick={() => onChange(category.name)}
        />
      ))}
    </nav>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {label}
      <span
        className={cn(
          'ml-1.5 tabular-nums',
          active ? 'text-muted-foreground' : 'text-muted-foreground/60',
        )}
      >
        {count}
      </span>
    </button>
  );
}
