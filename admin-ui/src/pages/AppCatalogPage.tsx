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
import { getAppDetailProfile, splitMultilineText } from '@/lib/app-detail';
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
  const appDetail = getAppDetailProfile(app);
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
  const primarySubscriptionPlan = appDetail.subscriptionPlans[0] ?? null;
  const fallbackPriceLabel =
    appDetail.purchaseType === 'free'
      ? '免费'
      : appDetail.purchaseType === 'onsite_subscription' && primarySubscriptionPlan?.price
        ? primarySubscriptionPlan.price
        : appDetail.price || (hasDirectAccess ? '免费使用' : '即将开放');
  const heroPriceLabel = offers.length > 0 ? priceRangeLabel : fallbackPriceLabel;
  const heroPriceDescription =
    offers.length > 1
      ? `${offers.length} 个套餐，购买时选择`
      : preferredOffer?.title ??
        (appDetail.purchaseType === 'offsite' && appDetail.purchaseUrl
          ? '站外购买，跳转至外部购买页'
          : appDetail.purchaseType === 'onsite_subscription' && primarySubscriptionPlan?.period
            ? `${primarySubscriptionPlan.period} 方案起售`
            : hasDirectAccess
              ? '可直接在线使用或下载'
              : '暂无可购买方案');
  const systemRequirements = splitMultilineText(appDetail.systemRequirements);
  const languages = splitMultilineText(appDetail.languages);
  const technicalNotes = appDetail.technicalNotes.trim();
  const usageInstructions = appDetail.usageInstructions.trim();
  const notes = appDetail.notes.trim();

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
    {
      key: 'pricing' as const,
      label: '套餐价格',
      show:
        offers.length > 0 ||
        appDetail.subscriptionPlans.length > 0 ||
        (appDetail.purchaseType !== 'free' && Boolean(appDetail.price || appDetail.purchaseUrl)),
    },
    { key: 'support' as const, label: 'FAQ / 资源', show: hasFaq || resourceCards.length > 0 },
  ].filter((item) => item.show);

  return (
    <div className="space-y-6">
        <Button variant="ghost" asChild className="px-0 text-muted-foreground">
          <Link to="/">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回应用中心
          </Link>
        </Button>

        <section className="relative overflow-hidden rounded-[28px] border border-gray-200 bg-gradient-to-b from-slate-100 via-sky-50/80 to-white shadow-sm shadow-slate-900/5">
          {app.coverUrl ? (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-cover bg-center opacity-[0.08]"
              style={{ backgroundImage: `url(${app.coverUrl})` }}
            />
          ) : null}

          <div className="relative grid gap-6 p-5 md:p-6 xl:grid-cols-[minmax(0,1fr),300px] xl:items-start">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-[112px,minmax(0,1fr)]">
                <div className="flex justify-center md:justify-start">
                  {app.iconUrl ? (
                    <img
                      src={app.iconUrl}
                      alt={app.name}
                      className="h-28 w-28 rounded-[22%] border border-gray-100 bg-white object-contain p-1 shadow-lg"
                    />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded-[22%] border border-gray-100 bg-white text-3xl font-semibold text-gray-400 shadow-lg">
                      {getInitials(app.name)}
                    </div>
                  )}
                </div>

                <div className="min-w-0 text-center md:text-left">
                  <div className="mb-3 flex flex-wrap items-center justify-center gap-2 md:justify-start">
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

                  <h1 className="text-2xl font-semibold tracking-tight text-gray-900 md:text-[2rem]">
                    {app.name}
                  </h1>
                  <p className="mt-3 max-w-3xl text-[15px] leading-7 text-gray-600 md:text-base">
                    {app.tagline || app.description || '该应用暂未提供简介。'}
                  </p>

                  {(appDetail.developer || appDetail.updateDate) ? (
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm text-gray-500 md:justify-start">
                      {appDetail.developer ? <span>{appDetail.developer}</span> : null}
                      {appDetail.developer && appDetail.updateDate ? <span className="text-gray-300">•</span> : null}
                      {appDetail.updateDate ? <span>更新于 {appDetail.updateDate}</span> : null}
                    </div>
                  ) : null}

                  {appDetail.platforms.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2 md:justify-start">
                      {appDetail.platforms.map((platform) => (
                        <Badge key={platform} className="bg-white text-gray-700 hover:bg-white">
                          {platform}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <aside className="w-full xl:justify-self-end">
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">价格</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">{heroPriceLabel}</p>
                  <p className="mt-2 text-sm leading-6 text-gray-500">
                    {heroPriceDescription}
                  </p>
                  {appDetail.trialDays > 0 && offers.length === 0 ? (
                    <p className="mt-2 text-xs text-emerald-600">支持 {appDetail.trialDays} 天免费试用</p>
                  ) : null}
                </div>

                {offers.length > 0 ? (
                  <Button className="mt-4 h-10 w-full rounded-xl" onClick={startCheckout} disabled={!preferredOffer}>
                    立即购买
                  </Button>
                ) : appDetail.purchaseType === 'offsite' && appDetail.purchaseUrl ? (
                  <Button className="mt-4 h-10 w-full rounded-xl" asChild>
                    <a href={appDetail.purchaseUrl} target="_blank" rel="noopener noreferrer">
                      前往购买
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                ) : websiteLink ? (
                  <Button className="mt-4 h-10 w-full rounded-xl" asChild>
                    <a href={websiteLink.url} target="_blank" rel="noopener noreferrer">
                      {getAccessLinkLabel(websiteLink)}
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                ) : primaryDownloadLink ? (
                  <Button className="mt-4 h-10 w-full rounded-xl" asChild>
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
                  <Button variant="outline" className="mt-2.5 h-10 w-full rounded-xl" asChild>
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
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="min-w-0 flex-1 lg:max-w-[calc(100%-300px-1.5rem)]">
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

              <div className="pt-5">
                {activeTab === 'intro' ? (
                  hasContent ? (
                    <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-a:text-primary prose-p:leading-relaxed prose-p:text-[15px]">
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
                        <div key={index} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm shadow-slate-900/5">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
                            {highlight.icon || '✦'}
                          </div>
                          <h3 className="mt-3 text-base font-semibold text-gray-900">{highlight.title}</h3>
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
                          <div className="border-t border-gray-100 px-4 py-3 text-sm text-gray-500">
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
                offers.length > 0 ? (
                  <div className="grid gap-4">
                    {offers.map((offer) => (
                      <OfferCard
                        key={offer.code}
                        offer={offer}
                        features={planFeatureMap.get(offer.planId) ?? []}
                      />
                    ))}
                  </div>
                ) : appDetail.subscriptionPlans.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {appDetail.subscriptionPlans.map((plan, index) => (
                      <div
                        key={`${plan.period}-${plan.price}-${index}`}
                        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm shadow-slate-900/5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-base font-semibold text-gray-900">{plan.period || '未命名周期'}</h3>
                          <p className="text-base font-semibold text-gray-900">{plan.price || '价格待定'}</p>
                        </div>
                        {plan.description ? (
                          <p className="mt-2 text-sm leading-6 text-gray-600">{plan.description}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : appDetail.purchaseType === 'offsite' && appDetail.purchaseUrl ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm shadow-slate-900/5">
                    <p className="text-sm leading-7 text-gray-600">
                      当前应用采用站外购买方式{appDetail.price ? `，参考价格为 ${appDetail.price}` : ''}。你可以通过下方按钮跳转到外部购买页面。
                    </p>
                    <Button className="mt-4 rounded-xl" asChild>
                      <a href={appDetail.purchaseUrl} target="_blank" rel="noopener noreferrer">
                        前往购买
                        <ArrowUpRight className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                ) : (
                  <EmptyState
                    icon={CreditCard}
                    title="暂无可购买的套餐"
                    description="该应用目前没有上架中的价格方案，请稍后再来查看。"
                  />
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

            <aside className="w-full shrink-0 lg:w-[300px]">
              <div className="space-y-4 lg:sticky lg:top-20">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-900/5">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">应用信息</h3>
                  <dl className="mt-4 space-y-3 text-sm">
                    {[
                      { label: '类型', value: getAppTypeLabel(app.type) },
                      { label: '分类', value: app.category || '未设置' },
                      { label: '状态', value: getAppStatusLabel(app.status) },
                      { label: '开发者', value: appDetail.developer || '未设置' },
                      { label: '版本', value: appDetail.version || '未设置' },
                      { label: '更新日期', value: appDetail.updateDate || formatTime(app.updatedAt) },
                      { label: '大小', value: appDetail.size || '未设置' },
                      { label: '语言', value: languages.length ? languages.join(' / ') : '未设置' },
                      { label: '更新时间', value: formatTime(app.updatedAt) },
                    ].map((item) => (
                      <div key={item.label} className="flex items-start justify-between gap-4">
                        <dt className="text-gray-500">{item.label}</dt>
                        <dd className="text-right font-medium text-gray-900">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                {systemRequirements.length > 0 ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-900/5">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">系统要求</h3>
                    <ul className="mt-3 space-y-2 text-sm text-gray-600">
                      {systemRequirements.map((requirement) => (
                        <li key={requirement} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                          <span>{requirement}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {technicalNotes ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-900/5">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">技术说明</h3>
                    <div className="prose prose-sm mt-3 max-w-none text-gray-600">
                      <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>
                        {technicalNotes}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : null}

                {appDetail.purchaseType === 'onsite_subscription' && appDetail.subscriptionPlans.length > 0 ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-900/5">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">订阅套餐</h3>
                    <div className="mt-3 space-y-3">
                      {appDetail.subscriptionPlans.map((plan, index) => (
                        <div key={`${plan.period}-${plan.price}-${index}`} className="rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-gray-900">{plan.period || '未命名周期'}</p>
                            <p className="text-sm font-semibold text-gray-900">{plan.price || '价格待定'}</p>
                          </div>
                          {plan.description ? (
                            <p className="mt-1 text-xs leading-5 text-gray-500">{plan.description}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {usageInstructions ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-900/5">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">使用说明</h3>
                    <div className="prose prose-sm mt-3 max-w-none text-gray-600">
                      <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>
                        {usageInstructions}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : null}

                {notes ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm shadow-slate-900/5">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">注意事项</h3>
                    <div className="prose prose-sm mt-3 max-w-none text-gray-600">
                      <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>
                        {notes}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : null}
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
