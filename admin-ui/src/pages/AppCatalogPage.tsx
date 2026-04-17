import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  LoaderCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

import { getAppCatalog } from '@/api/apps';
import { createCheckoutSession } from '@/api/user';
import { EmptyState } from '@/components/portal/EmptyState';
import { OfferCard } from '@/components/portal/OfferCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatOfferCycleLabel,
  formatOfferPriceLabel,
  getActiveOffers,
  getAppStatusLabel,
  getAppTypeLabel,
  getLinkTypeLabel,
  getPreferredOffer,
} from '@/lib/app-catalog-ui';
import { useAuth } from '@/lib/auth';
import { formatTime, getInitials } from '@/lib/utils';

type DetailTabKey = 'intro' | 'features' | 'screenshots' | 'pricing' | 'support';

export function AppCatalogPage() {
  const params = useParams<{ appCode: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [providerPreference, setProviderPreference] = useState<'wechat_pay' | 'alipay'>('wechat_pay');
  const [selectedOfferCode, setSelectedOfferCode] = useState<string>('');
  const [activeTab, setActiveTab] = useState<DetailTabKey>('intro');
  const [openFaqIndices, setOpenFaqIndices] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['app-catalog', params.appCode],
    queryFn: () => getAppCatalog(params.appCode ?? ''),
    enabled: Boolean(params.appCode),
  });

  useEffect(() => {
    setSelectedOfferCode('');
    setActiveTab('intro');
    setOpenFaqIndices(new Set());
  }, [params.appCode]);

  const offers = data?.offers.filter((offer) => offer.status === 'active') ?? [];

  const selectedOffer = useMemo(() => {
    if (!offers.length) return null;
    if (selectedOfferCode) {
      return offers.find((offer) => offer.code === selectedOfferCode) ?? offers[0];
    }
    return getPreferredOffer(offers);
  }, [offers, selectedOfferCode]);

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

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOffer) {
        throw new Error('请先选择一个套餐');
      }

      return createCheckoutSession({
        appCode: data?.app.code ?? '',
        planCode: selectedOffer.planCode,
        offerCode: selectedOffer.code,
        providerPreference,
        successUrl: `${window.location.origin}/orders`,
        cancelUrl: `${window.location.origin}${location.pathname}`,
      });
    },
    onSuccess: (result) => {
      window.location.href = result.presentation.url;
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '创建支付失败，请稍后重试');
    },
  });

  const startCheckout = () => {
    if (!isAuthenticated) {
      navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    checkoutMutation.mutate();
  };

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
        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 shadow-sm">
          <p className="text-center text-sm text-gray-500">
            应用不存在或暂未上架，请返回应用中心浏览其他应用。
          </p>
        </div>
      </div>
    );
  }

  const app = data.app;
  const hasHighlights = app.highlights.length > 0;
  const hasScreenshots = app.screenshots.length > 0;
  const hasContent = Boolean(app.content && app.content.trim().length > 0);
  const hasFaq = app.faq.length > 0;
  const hasAiTranslateWorkflowResources = app.code === 'ai_translate_workflow';
  const selectedFeatures = selectedOffer
    ? Array.from(new Set(planFeatureMap.get(selectedOffer.planId) ?? []))
    : [];
  const supportLink = app.links.find((item) => item.type === 'support');
  const websiteLink = app.links.find((item) => item.type === 'website');
  const docsLink = app.links.find((item) => item.type === 'docs');
  const activeAppOffers = getActiveOffers(app.checkoutOffers ?? []);

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
              ? '访问官网或产品主页'
              : link.type === 'download'
                ? '获取下载与安装入口'
                : '外部资源链接',
      typeLabel: getLinkTypeLabel(link.type),
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
    <div className="space-y-6">
      <Button variant="ghost" asChild className="px-0 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回应用中心
        </Link>
      </Button>

      <section className="-mx-4 border-b border-gray-200 bg-gradient-to-b from-slate-100 via-sky-50/75 to-white px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {app.coverUrl ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-cover bg-center opacity-[0.06]"
            style={{ backgroundImage: `url(${app.coverUrl})` }}
          />
        ) : null}

        <div className="relative grid gap-8 py-8 xl:grid-cols-[minmax(0,1fr),320px] xl:items-start">
          <div className="space-y-6">
            <div className="grid gap-5 md:grid-cols-[112px,minmax(0,1fr)]">
              <div className="flex justify-center md:justify-start">
                {app.iconUrl ? (
                  <img
                    src={app.iconUrl}
                    alt={app.name}
                    className="h-28 w-28 rounded-[22%] border border-gray-100 bg-white object-contain shadow-lg"
                  />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-[22%] border border-gray-100 bg-white text-3xl font-semibold text-gray-400 shadow-lg">
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
                  {selectedOffer?.badge ? (
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                      {selectedOffer.badge}
                    </Badge>
                  ) : null}
                </div>

                <h1 className="text-3xl font-semibold tracking-tight text-gray-900 md:text-4xl">
                  {app.name}
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600 md:text-lg">
                  {app.tagline || app.description || '统一展示应用价值、套餐和资源入口。'}
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-2 md:justify-start">
                  {[
                    `${app.highlights.length} 项亮点`,
                    `${activeAppOffers.length} 个方案`,
                    `${resourceCards.length} 个资源入口`,
                  ].map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:max-w-3xl">
              {[
                { label: '核心亮点', value: String(app.highlights.length), note: '帮助快速判断适用场景' },
                { label: '售卖方案', value: String(activeAppOffers.length), note: '支持按方案比较价格' },
                { label: '帮助入口', value: String(resourceCards.length), note: '文档、支持与下载入口' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-gray-200 bg-white/85 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{item.value}</p>
                  <p className="mt-2 text-sm leading-6 text-gray-500">{item.note}</p>
                </div>
              ))}
            </div>
          </div>

          <aside className="w-full xl:justify-self-end">
            <div className="rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">当前套餐</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-gray-900">
                  {selectedOffer?.title ?? '暂无可购买方案'}
                </h2>
                <p className="mt-3 text-3xl font-bold text-gray-900">
                  {formatOfferPriceLabel(selectedOffer)}
                </p>
                <p className="mt-1 text-sm text-gray-500">{formatOfferCycleLabel(selectedOffer)}</p>
                {selectedOffer?.description ? (
                  <p className="mt-3 text-sm leading-6 text-gray-500">{selectedOffer.description}</p>
                ) : null}
              </div>

              {offers.length > 1 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {offers.map((offer) => (
                    <button
                      key={offer.code}
                      type="button"
                      onClick={() => setSelectedOfferCode(offer.code)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                        selectedOffer?.code === offer.code
                          ? 'border-sky-200 bg-sky-50 text-sky-700'
                          : 'border-gray-200 bg-white text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      {offer.title}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-3">
                {(['wechat_pay', 'alipay'] as const).map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => setProviderPreference(provider)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${
                      providerPreference === provider
                        ? 'border-sky-200 bg-sky-50 text-sky-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {provider === 'wechat_pay' ? '微信支付' : '支付宝'}
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                {isAuthenticated && user ? `当前已登录：${user.email}` : '登录后即可直接购买并同步授权状态。'}
              </div>

              <Button
                className="mt-4 h-11 w-full rounded-2xl"
                onClick={startCheckout}
                disabled={!selectedOffer || checkoutMutation.isPending}
              >
                {checkoutMutation.isPending ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    正在跳转支付...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" />
                    {isAuthenticated ? '立即购买' : '登录后购买'}
                  </>
                )}
              </Button>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {websiteLink ? (
                  <Button variant="outline" className="rounded-2xl" asChild>
                    <a href={websiteLink.url} target="_blank" rel="noopener noreferrer">
                      官网
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
                {supportLink ? (
                  <Button variant="outline" className="rounded-2xl" asChild>
                    <a href={supportLink.url} target="_blank" rel="noopener noreferrer">
                      支持
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                ) : docsLink ? (
                  <Button variant="outline" className="rounded-2xl" asChild>
                    <a href={docsLink.url} target="_blank" rel="noopener noreferrer">
                      文档
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="py-2">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr),280px]">
          <div className="min-w-0">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex gap-8 overflow-x-auto" aria-label="Tabs">
                {visibleTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`shrink-0 border-b-2 px-1 pb-4 text-sm font-medium transition-colors ${
                      activeTab === tab.key
                        ? 'border-sky-500 text-sky-600'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
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
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
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
                      <div key={index} className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl shadow-sm">
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
                        className="group overflow-hidden rounded-2xl border border-gray-200 bg-white transition-colors hover:border-sky-200"
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
                        selected={selectedOffer?.code === offer.code}
                        features={planFeatureMap.get(offer.planId) ?? []}
                        onSelect={() => setSelectedOfferCode(offer.code)}
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
                          <div key={index} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
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
                          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 transition-colors hover:border-sky-200 hover:bg-sky-50/40">
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

          <aside className="w-full shrink-0">
            <div className="space-y-5 lg:sticky lg:top-24">
              <div className="rounded-2xl bg-gray-50 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-gray-900">应用信息</h3>
                <dl className="mt-4 space-y-3 text-sm">
                  {[
                    { label: '类型', value: getAppTypeLabel(app.type) },
                    { label: '分类', value: app.category || '未设置' },
                    { label: '状态', value: getAppStatusLabel(app.status) },
                    { label: '更新时间', value: formatTime(app.updatedAt) },
                    { label: '资源入口', value: `${resourceCards.length} 个` },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start justify-between gap-4">
                      <dt className="text-gray-500">{item.label}</dt>
                      <dd className="text-right font-medium text-gray-900">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {selectedOffer ? (
                <div className="rounded-2xl bg-sky-50 p-5">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-gray-900">当前方案</h3>
                  <p className="mt-3 text-lg font-semibold text-gray-900">{selectedOffer.title}</p>
                  <p className="mt-1 text-sm text-gray-600">{formatOfferCycleLabel(selectedOffer)}</p>
                  <p className="mt-4 text-2xl font-bold text-gray-900">
                    {formatOfferPriceLabel(selectedOffer)}
                  </p>
                  {selectedFeatures.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedFeatures.slice(0, 8).map((feature) => (
                        <span
                          key={feature}
                          className="inline-flex items-center gap-1 rounded-full border border-sky-100 bg-white px-3 py-1 text-xs font-medium text-gray-700"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          {feature}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {resourceCards.length > 0 ? (
                <div className="rounded-2xl bg-gray-50 p-5">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-gray-900">资源入口</h3>
                  <div className="mt-4 space-y-3">
                    {resourceCards.map((resource) => {
                      const isInternal = resource.url.startsWith('/');
                      const row = (
                        <div className="flex items-start justify-between gap-3 rounded-2xl bg-white px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{resource.label}</p>
                            <p className="mt-1 text-xs leading-5 text-gray-500">{resource.note}</p>
                          </div>
                          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        </div>
                      );

                      return isInternal ? (
                        <Link key={resource.label} to={resource.url} className="block no-underline">
                          {row}
                        </Link>
                      ) : (
                        <a
                          key={resource.label}
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block no-underline"
                        >
                          {row}
                        </a>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
