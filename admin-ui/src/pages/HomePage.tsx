import { useQuery } from '@tanstack/react-query';
import { Boxes, LoaderCircle } from 'lucide-react';

import { listApps } from '@/api/apps';
import { AppCard } from '@/components/portal/AppCard';
import { EmptyState } from '@/components/portal/EmptyState';
import { MetricStrip } from '@/components/portal/MetricStrip';
import { PageHeader } from '@/components/portal/PageHeader';
import { Badge } from '@/components/ui/badge';

export function HomePage() {
  const { data, isLoading } = useQuery({ queryKey: ['public-apps'], queryFn: listApps });
  const apps = data?.items ?? [];

  return (
    <div className="space-y-8">
      <PageHeader sectionKey="discover" />

      <MetricStrip
        items={[
          { label: 'Visible Apps', value: apps.length, note: '当前已开放购买的产品数量。' },
          { label: 'Billing Model', value: 'Hosted Checkout', note: '统一复用现有 checkout 会话，而不是各应用自行结账。' },
          { label: 'Access Model', value: 'Entitlements', note: '购买结果沉淀为授权，供后续安装、解锁和部署复用。' },
          { label: 'Delivery Focus', value: 'Headless WP', note: '最复杂的系统交付会优先接进部署中心。' }
        ]}
      />

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight">可购买产品</h2>
            <p className="text-sm text-muted-foreground">先用最小闭环承载套餐浏览与购买入口，复杂部署控制后续继续补齐。</p>
          </div>
          <Badge variant="secondary">{apps.length} 个应用</Badge>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="flex min-h-52 items-center justify-center rounded-3xl border border-slate-200 bg-white/80">
                <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
              </div>
            ))}
          </div>
        ) : apps.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="当前还没有开放购买的应用"
            description="先在后台完成应用接入、价格配置和激活状态，用户侧才会展示产品中心内容。"
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {apps.map((app) => <AppCard key={app.id} app={app} />)}
          </div>
        )}
      </section>
    </div>
  );
}
