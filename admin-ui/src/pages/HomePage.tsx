import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Boxes, CreditCard, Rocket, ShieldCheck, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { listApps } from '@/api/apps';
import { AppCard } from '@/components/portal/AppCard';
import { EmptyState } from '@/components/portal/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatAmount, getInitials } from '@/lib/utils';

export function HomePage() {
  const { data, isLoading } = useQuery({ queryKey: ['public-apps'], queryFn: listApps });
  const apps = data?.items ?? [];

  const categories = Array.from(new Set(apps.map((app) => app.category).filter(Boolean))) as string[];
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredApps = useMemo(() => (
    activeCategory
      ? apps.filter((app) => app.category === activeCategory)
      : apps
  ), [activeCategory, apps]);

  const featuredApp = filteredApps[0] ?? null;
  const spotlightApps = filteredApps.slice(1, 3);
  const gridApps = filteredApps.slice(3);
  const catalogApps = filteredApps.length > 3 ? gridApps : [];

  const paidApps = apps.filter((app) => (app.checkoutOffers ?? []).some((offer) => offer.status === 'active')).length;
  const freeApps = Math.max(0, apps.length - paidApps);

  return (
    <div className="max-w-7xl mx-auto space-y-12 px-4 sm:px-6 lg:px-8 py-8">
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr),minmax(320px,420px)]">
        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
            <Sparkles className="h-3.5 w-3.5" />
            Product Catalog
          </div>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            发现、购买并持续管理你的应用交付链路
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-gray-600 sm:text-lg">
            FD Stack 用户侧不是简单的“应用列表”。它应该同时承接产品发现、购买决策、授权同步和后续部署入口，
            让用户在一个统一前台里完成从了解产品到开始使用的全过程。
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <a href="#app-discovery">
                浏览应用
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/access">查看我的应用</Link>
            </Button>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              {
                label: '应用总数',
                value: String(apps.length || 0),
                note: '当前已接入可浏览应用'
              },
              {
                label: '付费方案',
                value: String(paidApps),
                note: '可直接购买与开通授权'
              },
              {
                label: '免费体验',
                value: String(freeApps),
                note: '无需付款即可立即开始'
              }
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">{item.value}</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">{item.note}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          {[
            {
              icon: ShieldCheck,
              title: '统一授权',
              desc: '购买完成后授权自动同步，用户可以在同一前台查看应用解锁状态。'
            },
            {
              icon: CreditCard,
              title: '购买闭环',
              desc: '详情页、价格方案和支付入口保持统一语义，减少从“了解”到“购买”的跳转损耗。'
            },
            {
              icon: Rocket,
              title: '后续交付',
              desc: '购买后不只是“订单完成”，还可以继续承接部署、交付和持续服务。'
            }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title} className="border-gray-200 bg-white shadow-sm">
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-semibold tracking-tight text-gray-900">{item.title}</p>
                    <p className="text-sm leading-relaxed text-gray-600">{item.desc}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {featuredApp ? (
        <section className="space-y-5" id="app-discovery">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Featured</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">精选应用</h2>
            </div>
            <p className="hidden max-w-xl text-sm leading-relaxed text-gray-500 lg:block">
              首页首先应该把最值得点击的一款产品以更强密度陈列出来，再把其余应用作为延展入口。
            </p>
          </div>

          <Card className="overflow-hidden rounded-lg border-gray-200 bg-white shadow-lg">
            <div className="grid lg:grid-cols-[1.2fr,minmax(320px,420px)]">
              <div className="relative overflow-hidden border-b border-gray-200 bg-gradient-to-br from-gray-900 via-gray-800 to-blue-700 p-8 text-white lg:border-b-0 lg:border-r">
                {featuredApp.coverUrl ? (
                  <div
                    className="absolute inset-0 bg-cover bg-center opacity-25"
                    style={{ backgroundImage: `url(${featuredApp.coverUrl})` }}
                  />
                ) : null}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(125,211,252,0.28),_transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.18),transparent_65%)]" />
                <div className="relative space-y-5">
                  <div className="flex flex-wrap gap-2">
                    {featuredApp.category ? (
                      <Badge className="bg-white/14 text-white hover:bg-white/14">{featuredApp.category}</Badge>
                    ) : null}
                    <Badge className="bg-white/10 text-white hover:bg-white/10">
                      {featuredApp.type === 'extension' ? 'Extension' : featuredApp.type}
                    </Badge>
                  </div>

                  <div className="flex items-start gap-5">
                    {featuredApp.iconUrl ? (
                      <img
                        src={featuredApp.iconUrl}
                        alt={featuredApp.name}
                        className="h-20 w-20 shrink-0 rounded-lg border border-white/15 bg-white/85 object-cover shadow-lg"
                      />
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-2xl font-semibold text-white shadow-lg">
                        {getInitials(featuredApp.name)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-3xl font-semibold tracking-tight">{featuredApp.name}</h3>
                      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-blue-50/88">
                        {featuredApp.tagline || featuredApp.description || '围绕发现、购买与交付打造的高质量应用。'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs text-blue-50/80">
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                      {featuredApp.highlights.length || 0} 项核心亮点
                    </span>
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                      {(featuredApp.checkoutOffers ?? []).filter((offer) => offer.status === 'active').length} 个可购方案
                    </span>
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                      统一授权与持续交付
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-6 p-8">
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Quick Pitch</p>
                  <p className="text-base leading-relaxed text-gray-700">
                    {(featuredApp.description || featuredApp.tagline || '').trim() || '这是一款更适合放在首页 hero 位置的应用，它的信息密度、视觉层级和转化路径都应该比普通卡片更完整。'}
                  </p>
                </div>

                <div className="flex items-end justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">起始价格</p>
                    <p className="text-3xl font-semibold tracking-tight text-gray-900">
                      {(() => {
                        const activeOffers = (featuredApp.checkoutOffers ?? []).filter((offer) => offer.status === 'active');
                        if (!activeOffers.length) {
                          return '即将开放';
                        }
                        const cheapest = activeOffers.reduce((min, offer) => (
                          offer.priceAmount < min.priceAmount ? offer : min
                        ), activeOffers[0]);
                        return formatAmount(cheapest.priceAmount, cheapest.currency);
                      })()}
                    </p>
                  </div>
                  <Button size="lg" asChild>
                    <Link to={`/apps/${featuredApp.code}`}>
                      查看详情
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </section>
      ) : null}

      {spotlightApps.length > 0 ? (
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Spotlight</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">继续探索</h2>
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {spotlightApps.map((app) => {
              const activeOffers = (app.checkoutOffers ?? []).filter((offer) => offer.status === 'active');
              const cheapest = activeOffers.length
                ? activeOffers.reduce((min, offer) => (offer.priceAmount < min.priceAmount ? offer : min), activeOffers[0])
                : null;

              return (
                <Card key={app.id} className="overflow-hidden rounded-lg border-gray-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                  <div className="flex flex-col gap-5 p-6 sm:flex-row">
                    {app.iconUrl ? (
                      <img
                        src={app.iconUrl}
                        alt={app.name}
                        className="h-20 w-20 shrink-0 rounded-lg bg-gray-50 object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-gray-900 via-gray-700 to-blue-600 text-2xl font-semibold text-white">
                        {getInitials(app.name)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {app.category ? <Badge variant="secondary">{app.category}</Badge> : null}
                        <Badge variant="outline">{app.type}</Badge>
                      </div>
                      <h3 className="mt-3 text-xl font-semibold tracking-tight text-gray-900">{app.name}</h3>
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-600">
                        {app.tagline || app.description || '高质量应用入口'}
                      </p>
                      <div className="mt-5 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">起始价格</p>
                          <p className="mt-1 text-lg font-semibold text-gray-900">
                            {cheapest ? formatAmount(cheapest.priceAmount, cheapest.currency) : '即将开放'}
                          </p>
                        </div>
                        <Button variant="outline" asChild>
                          <Link to={`/apps/${app.code}`}>
                            详情页
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Filter</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">按分类浏览</h2>
          </div>
          <p className="hidden text-sm text-gray-500 lg:block">把应用筛选做成一条产品化导航带，而不是临时按钮集合。</p>
        </div>
        <Card className="rounded-lg border-gray-200 bg-white p-4 shadow-sm">
          <CardContent className="flex flex-wrap gap-2 p-0">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
                activeCategory === null
                  ? 'border-slate-900 bg-gray-900 text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-slate-300 hover:bg-gray-50'
              }`}
            >
              全部应用
            </button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
                  activeCategory === category
                    ? 'border-primary bg-primary text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-slate-300 hover:bg-gray-50'
                }`}
              >
                {category}
              </button>
            ))}
          </CardContent>
        </Card>
      </section>

      {isLoading || filteredApps.length === 0 || catalogApps.length > 0 ? (
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">All Apps</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">全部应用</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                当前筛选结果共 {filteredApps.length} 个应用。首页列表应该更像陈列页，而不是单纯的后台网格。
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="animate-pulse rounded-lg border border-gray-200 bg-white/85 p-6 shadow-sm">
                  <div className="h-32 rounded-lg bg-gray-100" />
                  <div className="mt-5 flex gap-4">
                    <div className="h-14 w-14 rounded-lg bg-gray-100" />
                    <div className="flex-1 space-y-3">
                      <div className="h-5 w-32 rounded bg-gray-100" />
                      <div className="h-4 w-full rounded bg-gray-100" />
                      <div className="h-4 w-3/4 rounded bg-gray-100" />
                    </div>
                  </div>
                  <div className="mt-6 h-10 rounded-lg bg-gray-100" />
                </div>
              ))}
            </div>
          ) : filteredApps.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="暂无应用"
              description="当前还没有可浏览的应用，请稍后再来看看。"
            />
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {catalogApps.map((app) => (
                <AppCard key={app.id} app={app} />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
