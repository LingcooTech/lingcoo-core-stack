import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, CheckCircle2, ChevronDown, CreditCard, Download, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

import { getAppCatalog } from '@/api/apps';
import { AppPurchaseDialog } from '@/components/portal/AppPurchaseDialog';
import { EmptyState } from '@/components/portal/EmptyState';
import { OfferCard } from '@/components/portal/OfferCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getAccessLinkLabel,
  formatOfferRangeLabel,
  getAppStatusLabel,
  getAppTypeLabel,
  getLinksByType,
  getLinkTypeLabel,
  getPrimaryDownloadLink,
  getPrimaryWebsiteLink,
  getPreferredOffer,
} from '@/lib/app-catalog-ui';
import { getAppDeliveryMode } from '@/lib/app-delivery';
import { useAuth } from '@/lib/auth';
import { formatTime, getInitials } from '@/lib/utils';

type DetailTabKey = 'intro' | 'features' | 'screenshots' | 'pricing' | 'support';

export function AppCatalogPage() {
  const params = useParams<{ appCode: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<DetailTabKey>('intro');
  const [openFaqIndices, setOpenFaqIndices] = useState<Set<number>>(new Set());
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['app-catalog', params.appCode],
    queryFn: () => getAppCatalog(params.appCode ?? ''),
    enabled: Boolean(params.appCode),
  });

  useEffect(() => {
    setActiveTab('intro');
    setOpenFaqIndices(new Set());
    setPurchaseDialogOpen(false);
  }, [params.appCode]);

  const offers = data?.offers.filter((offer) => offer.status === 'active') ?? [];
  const preferredOffer = useMemo(() => getPreferredOffer(offers), [offers]);
  const priceRangeLabel = useMemo(() => formatOfferRangeLabel(offers), [offers]);

  const planFeatureMap = useMemo(() => {
    const featureMap = new Map((data?.features ?? []).map((feature) => [feature.id, feature]));
    const grouped = new Map<string, string[]>();

    for (const mapping of data?.planFeatures ?? []) {
      const feature = featureMap.get(mapping.featureId);
      if (!feature) continue;
      if (!grouped.has(mapping.planId)) {
        grouped.set(mapping.planId, []);
      }
      grouped.get(mapping.planId)?.push(feature.name);
    }

    return grouped;
  }, [data]);

  const toggleFaq = (index: number) => {
    setOpenFaqIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const startCheckout = () => {
    if (!isAuthenticated) {
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setPurchaseDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild className="px-0 text-muted-foreground">
          <Link to="/">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回应用中心
          </Link>
        </Button>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-center text-sm text-gray-500">
            应用不存在或暂未上架，请返回应用中心浏览其他应用。
          </p>
        </div>
      </div>
    );
  }

  const app = data.app;
  const isDeployable = getAppDeliveryMode(app) === 'one_click';
  const hasHighlights = app.highlights.length > 0;
  const hasScreenshots = app.screenshots.length > 0;
  const hasContent = Boolean(app.content && app.content.trim().length > 0);
  const hasFaq = app.faq.length > 0;
  const hasAiTranslateWorkflowResources = app.code === 'ai_translate_workflow';
  const websiteLinks = getLinksByType(app.links, 'website');
  const downloadLinks = getLinksByType(app.links, 'download');
  const websiteLink = getPrimaryWebsiteLink(app.links);
  const primaryDownloadLink = getPrimaryDownloadLink(app.links);
  const hasDirectAccess = !isDeployable && (websiteLinks.length > 0 || downloadLinks.length > 0);
  const heroPriceLabel = offers.length > 0 ? priceRangeLabel : hasDirectAccess ? '免费使用' : priceRangeLabel;
  const heroPriceDescription =
    offers.length > 1
      ? `${offers.length} 个套餐，购买时选择`
      : preferredOffer?.title ?? (hasDirectAccess ? '可直接在线使用或下载' : '暂无可购买方案');

  const resourceCards = [
    ...(app.links ?? []).map((link) => ({
      label: link.label,
      url: link.url,
      note:
        link.type === 'docs'
          ? '查看说明文档与操作指引'
          : link.type === 'support'
            ? '进入支持入口与帮助说明'
            : link.type === 'website'
              ? !isDeployable
                ? '打开在线入口并立即使用'
                : '访问官网或产品主页'
              : link.type === 'download'
                ? '获取下载与安装入口'
                : '外部资源链接',
      typeLabel: link.type === 'website' && !isDeployable ? '在线使用' : getLinkTypeLabel(link.type),
    })),
    ...(hasAiTranslateWorkflowResources
      ? [
          {
            label: '隐私政策',
            url: '/apps/ai-translate-workflow/privacy',
            note: '查看数据流、权限用途与删除方式',
            typeLabel: '合规',
          },
          {
            label: '支持页',
            url: '/apps/ai-translate-workflow/support',
            note: '查看账号、授权、OpenRouter 与导出排障建议',
            typeLabel: '支持',
          },
        ]
      : []),
  ];

  const visibleTabs = [
    { key: 'intro' as const, label: '应用介绍', show: true },
    { key: 'features' as const, label: '功能特性', show: hasHighlights },
    { key: 'screenshots' as const, label: '应用截图', show: hasScreenshots },
    { key: 'pricing' as const, label: '套餐价格', show: offers.length > 0 },
    { key: 'support' as const, label: 'FAQ / 资源', show: hasFaq || resourceCards.length > 0 },
  ].filter((item) => item.show);

  return (
    <div className="space-y-8">
        <Button variant="ghost" asChild className="px-0 text-muted-foreground">
          <Link to="/">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回应用中心
          </Link>
        </Button>

        <section className="relative overflow-hidden rounded-3xl border border-gray-200 bg-gradient-to-b from-slate-100 via-sky-50/80 to-white shadow-sm shadow-slate-900/5">
          {app.coverUrl ? (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-cover bg-center opacity-[0.08]"
              style={{ backgroundImage: `url(${app.coverUrl})` }}
            />
          ) : null}

          <div className="relative grid gap-8 p-6 md:p-8 xl:grid-cols-[minmax(0,1fr),320px] xl:items-start">
            <div className="space-y-6">
              <div className="grid gap-5 md:grid-cols-[128px,minmax(0,1fr)]">
                <div className="flex justify-center md:justify-start">
                  {app.iconUrl ? (
                    <img
                      src={app.iconUrl}
                      alt={app.name}
                      className="h-32 w-32 rounded-[22%] border border-gray-100 bg-white object-contain p-1 shadow-lg"
                    />
                  ) : (
                    <div className="flex h-32 w-32 items-center justify-center rounded-[22%] border border-gray-100 bg-white text-3xl font-semibold text-gray-400 shadow-lg">
                      {getInitials(app.name)}
                    </div>
                  )}
                </div>

                <div className="min-w-0 text-center md:text-left">
                  <div className="mb-4 flex flex-wrap items-center justify-center gap-2 md:justify-start">
                    {app.category ? (
                      <Badge className="bg-sky-50 text-sky-700 hover:bg-sky-50">{app.category}</Badge>
                    ) : null}
                    <Badge className="bg-white text-gray-700 hover:bg-white">
                      {getAppTypeLabel(app.type)}
                    </Badge>
                    <Badge className="bg-white text-gray-700 hover:bg-white">
                      {getAppStatusLabel(app.status)}
                    </Badge>
                    {preferredOffer?.badge ? (
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                        {preferredOffer.badge}
                      </Badge>
                    ) : null}
                  </div>

                  <h1 className="text-3xl font-semibold tracking-tight text-gray-900 md:text-4xl">
                    {app.name}
                  </h1>
                  <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600 md:text-lg">
                    {app.tagline || app.description || '该应用暂未提供简介。'}
                  </p>
                </div>
              </div>
            </div>

            <aside className="w-full xl:justify-self-end">
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">价格</p>
                  <p className="mt-3 text-4xl font-bold text-gray-900">{heroPriceLabel}</p>
                  <p className="mt-2 text-sm text-gray-500">
                    {heroPriceDescription}
                  </p>
                </div>

                {offers.length > 0 ? (
                  <Button className="mt-5 h-11 w-full rounded-xl" onClick={startCheckout} disabled={!preferredOffer}>
                    立即购买
                  </Button>
                ) : websiteLink ? (
                  <Button className="mt-5 h-11 w-full rounded-xl" asChild>
                    <a href={websiteLink.url} target="_blank" rel="noopener noreferrer">
                      {getAccessLinkLabel(websiteLink)}
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                ) : primaryDownloadLink ? (
                  <Button className="mt-5 h-11 w-full rounded-xl" asChild>
                    <a href={primaryDownloadLink.url} target="_blank" rel="noopener noreferrer">
                      {getAccessLinkLabel(primaryDownloadLink)}
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                ) : (
                  <Button className="mt-5 h-11 w-full rounded-xl" disabled>
                    暂未提供访问入口
                  </Button>
                )}

                {websiteLink && offers.length > 0 ? (
                  <Button variant="outline" className="mt-3 h-11 w-full rounded-xl" asChild>
                    <a href={websiteLink.url} target="_blank" rel="noopener noreferrer">
                      在线使用
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}

                {primaryDownloadLink ? (
                  <Button variant="outline" className="mt-3 h-11 w-full rounded-xl" asChild>
                    <a href={primaryDownloadLink.url} target="_blank" rel="noopener noreferrer">
                      {getAccessLinkLabel(primaryDownloadLink)}
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}

                {!offers.length && downloadLinks.length > 1 ? (
                  <p className="mt-3 text-center text-xs text-gray-500">
                    另有 {downloadLinks.length - 1} 个下载渠道，可在下方资源区查看。
                  </p>
                ) : null}
              </div>
            </aside>
          </div>
        </section>

        <section className="py-1">
          <div className="flex flex-col gap-8 lg:flex-row">
            <div className="min-w-0 flex-1 lg:max-w-[calc(100%-320px-2rem)]">
              <div className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm shadow-slate-900/5">
                <nav className="flex gap-2 overflow-x-auto" aria-label="Tabs">
                  {visibleTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === tab.key
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="pt-6">
                {activeTab === 'intro' ? (
                  hasContent ? (
                    <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-a:text-primary prose-p:leading-relaxed">
                      <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>
                        {app.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm shadow-slate-900/5">
                      <p className="text-sm leading-7 text-gray-600">
                        {app.description || app.tagline || '该应用暂未提供详细介绍。'}
                      </p>
                    </div>
                  )
                ) : null}

                {activeTab === 'features' ? (
                  hasHighlights ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {app.highlights.map((highlight, index) => (
                        <div key={index} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm shadow-slate-900/5">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
                            {highlight.icon || '✦'}
                          </div>
                          <h3 className="mt-4 text-lg font-semibold text-gray-900">{highlight.title}</h3>
                          <p className="mt-2 text-sm leading-6 text-gray-600">{highlight.description}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={CheckCircle2}
                      title="暂无功能特性"
                      description="当前还没有录入应用亮点。"
                    />
                  )
                ) : null}

              {activeTab === 'screenshots' ? (
                hasScreenshots ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {app.screenshots.map((screenshot, index) => (
                      <a
                        key={index}
                        href={screenshot.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm shadow-slate-900/5 transition-colors hover:border-sky-200 hover:shadow-lg hover:shadow-slate-900/8"
                      >
                        <div className="aspect-[16/10] overflow-hidden bg-gray-100">
                          <img
                            src={screenshot.url}
                            alt={screenshot.caption || `截图 ${index + 1}`}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                          />
                        </div>
                        {screenshot.caption ? (
                          <div className="border-t border-gray-100 px-5 py-4 text-sm text-gray-500">
                            {screenshot.caption}
                          </div>
                        ) : null}
                      </a>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={LoaderCircle}
                    title="暂无截图"
                    description="当前还没有录入应用截图。"
                  />
                )
              ) : null}

              {activeTab === 'pricing' ? (
                offers.length === 0 ? (
                  <EmptyState
                    icon={CreditCard}
                    title="暂无可购买的套餐"
                    description="该应用目前没有上架中的价格方案，请稍后再来查看。"
                  />
                ) : (
                  <div className="grid gap-4">
                    {offers.map((offer) => (
                      <OfferCard
                        key={offer.code}
                        offer={offer}
                        features={planFeatureMap.get(offer.planId) ?? []}
                      />
                    ))}
                  </div>
                )
              ) : null}

              {activeTab === 'support' ? (
                <div className="space-y-6">
                  {hasFaq ? (
                    <div className="space-y-3">
                      {app.faq.map((item, index) => {
                        const open = openFaqIndices.has(index);

                        return (
                          <div key={index} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                            <button
                              type="button"
                              onClick={() => toggleFaq(index)}
                              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                            >
                              <span className="text-base font-semibold text-gray-900">{item.question}</span>
                              <ChevronDown
                                className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                                  open ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                            {open ? (
                              <div className="border-t border-gray-100 px-6 py-5 text-sm leading-7 text-gray-600">
                                {item.answer}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {resourceCards.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {resourceCards.map((resource) => {
                        const isInternal = resource.url.startsWith('/');
                        const card = (
                          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm shadow-slate-900/5 transition-colors hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-lg hover:shadow-slate-900/8">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-white text-gray-700 hover:bg-white">
                                {resource.typeLabel}
                              </Badge>
                              <p className="text-sm font-semibold text-gray-900">{resource.label}</p>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-gray-500">{resource.note}</p>
                          </div>
                        );

                        return isInternal ? (
                          <Link key={resource.label} to={resource.url} className="block no-underline">
                            {card}
                          </Link>
                        ) : (
                          <a
                            key={resource.label}
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block no-underline"
                          >
                            {card}
                          </a>
                        );
                      })}
                    </div>
                  ) : null}

                  {!hasFaq && resourceCards.length === 0 ? (
                    <EmptyState
                      icon={ArrowUpRight}
                      title="暂无帮助内容"
                      description="当前还没有 FAQ 或外部资源入口。"
                    />
                  ) : null}
                </div>
              ) : null}
              </div>
            </div>

            <aside className="w-full shrink-0 lg:w-80">
              <div className="space-y-5 lg:sticky lg:top-24">
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm shadow-slate-900/5">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">应用信息</h3>
                  <dl className="mt-4 space-y-3 text-sm">
                    {[
                      { label: '类型', value: getAppTypeLabel(app.type) },
                      { label: '分类', value: app.category || '未设置' },
                      { label: '状态', value: getAppStatusLabel(app.status) },
                      { label: '更新时间', value: formatTime(app.updatedAt) },
                    ].map((item) => (
                      <div key={item.label} className="flex items-start justify-between gap-4">
                        <dt className="text-gray-500">{item.label}</dt>
                        <dd className="text-right font-medium text-gray-900">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </aside>
          </div>
        </section>

      <AppPurchaseDialog
        appCode={app.code}
        appName={app.name}
        open={purchaseDialogOpen}
        onOpenChange={setPurchaseDialogOpen}
        offers={offers}
        initialOfferCode={preferredOffer?.code ?? null}
        websiteUrl={websiteLink?.url ?? null}
      />
    </div>
  );
}
