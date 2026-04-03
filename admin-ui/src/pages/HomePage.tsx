import { useQuery } from '@tanstack/react-query';
import { Boxes } from 'lucide-react';
import { useState } from 'react';

import { listApps } from '@/api/apps';
import { AppCard } from '@/components/portal/AppCard';
import { EmptyState } from '@/components/portal/EmptyState';

export function HomePage() {
  const { data, isLoading } = useQuery({ queryKey: ['public-apps'], queryFn: listApps });
  const apps = data?.items ?? [];

  const categories = Array.from(new Set(apps.map((app) => app.category).filter(Boolean))) as string[];
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredApps = activeCategory
    ? apps.filter((app) => app.category === activeCategory)
    : apps;

  return (
    <div className="space-y-10">
      <section className="space-y-2 pt-4">
        <h1 className="text-4xl font-black tracking-tight text-slate-950">产品中心</h1>
        <p className="text-lg text-muted-foreground">发现并获取可购买、可授权、可交付的软件产品</p>
      </section>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              activeCategory === null
                ? 'border-primary bg-primary text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
          >
            全部
          </button>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                activeCategory === category
                  ? 'border-primary bg-primary text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="flex min-h-64 animate-pulse flex-col rounded-2xl border border-slate-200 bg-white/80 p-6">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-slate-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-32 rounded bg-slate-100" />
                  <div className="h-4 w-48 rounded bg-slate-100" />
                </div>
              </div>
              <div className="mt-auto pt-6">
                <div className="h-10 w-full rounded-lg bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredApps.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="暂无产品"
          description="当前还没有可浏览的产品，请稍后再来看看。"
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredApps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  );
}
