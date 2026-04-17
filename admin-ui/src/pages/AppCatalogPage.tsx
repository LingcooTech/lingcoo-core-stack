import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  ExternalLink,
  LoaderCircle,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { formatAmount, getInitials } from '@/lib/utils';

export function AppCatalogPage() {
  const params = useParams<{ appCode: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [providerPreference, setProviderPreference] = useState<'wechat_pay' | 'alipay'>('wechat_pay');
  const [selectedOfferCode, setSelectedOfferCode] = useState<string>('');
  const [openFaqIndices, setOpenFaqIndices] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['app-catalog', params.appCode],
    queryFn: () => getAppCatalog(params.appCode ?? ''),
    enabled: Boolean(params.appCode)
  });

  const offers = data?.offers.filter((offer) => offer.status === 'active') ?? [];

  const selectedOffer = useMemo(() => {
    if (!offers.length) return null;
    if (selectedOfferCode) {
      return offers.find((offer) => offer.code === selectedOfferCode) ?? offers[0];
    }
    return offers.find((offer) => offer.isDefault) ?? offers[0];
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
        cancelUrl: `${window.location.origin}${location.pathname}`
      });
    },
    onSuccess: (result) => {
      window.location.href = result.presentation.url;
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '创建支付失败，请稍后重试');
    }
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
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            应用不存在或暂未上架，请返回应用中心浏览其他应用。
          </CardContent>
        </Card>
      </div>
    );
  }

  const app = data.app;
  const hasHighlights = app.highlights && app.highlights.length > 0;
  const hasScreenshots = app.screenshots && app.screenshots.length > 0;
  const hasContent = app.content && app.content.trim().length > 0;
  const hasFaq = app.faq && app.faq.length > 0;
  const hasAiTranslateWorkflowResources = app.code === 'ai_translate_workflow';
  const selectedFeatures = selectedOffer ? Array.from(new Set(planFeatureMap.get(selectedOffer.planId) ?? [])) : [];
  const supportLink = app.links.find((item) => item.type === 'support');
  const websiteLink = app.links.find((item) => item.type === 'website');
  const docsLink = app.links.find((item) => item.type === 'docs');

  const resourceCards = [
    ...(app.links ?? []).map((link) => ({
      label: link.label,
      url: link.url,
      note:
        link.type === 'docs' ? '查看说明文档与操作指引' :
        link.type === 'support' ? '进入支持入口与帮助说明' :
        link.type === 'website' ? '访问官网或产品主页' :
        link.type === 'download' ? '获取下载与安装入口' : '外部资源链接',
      typeLabel:
        link.type === 'docs' ? '文档' :
        link.type === 'support' ? '支持' :
        link.type === 'website' ? '官网' :
        link.type === 'download' ? '下载' : '链接'
    })),
    ...(hasAiTranslateWorkflowResources ? [
      {
        label: '隐私政策',
        url: '/apps/ai-translate-workflow/privacy',
        note: '查看数据流、权限用途与删除方式',
        typeLabel: '合规'
      },
      {
        label: '支持页',
        url: '/apps/ai-translate-workflow/support',
        note: '查看账号、授权、OpenRouter 与导出排障建议',
        typeLabel: '支持'
      }
    ] : [])
  ];

  return (
    <div className="space-y-12">
      <Button variant="ghost" asChild className="px-0 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回应用中心
        </Link>
      </Button>

      <section className="overflow-hidden rounded-[36px] border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-900/5">
        <div className="grid lg:grid-cols-[minmax(0,1.2fr),380px]">
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-800 to-sky-700 p-8 text-white md:p-10">
            {app.coverUrl ? (
              <div
                className="absolute inset-0 bg-cover bg-center opacity-25"
                style={{ backgroundImage: `url(${app.coverUrl})` }}
              />
            ) : null}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(125,211,252,0.3),_transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.06),transparent_60%)]" />
            <div className="relative space-y-7">
              <div className="flex flex-wrap gap-2">
                {app.category ? (
                  <Badge className="bg-white/14 text-white hover:bg-white/14">{app.category}</Badge>
                ) : null}
                <Badge className="bg-white/10 text-white hover:bg-white/10">
                  {app.type === 'extension' ? 'Extension' : app.type}
                </Badge>
                {selectedOffer?.badge ? (
                  <Badge className="bg-amber-300/90 text-slate-950 hover:bg-amber-300/90">{selectedOffer.badge}</Badge>
                ) : null}
              </div>

              <div className="flex flex-col gap-6 md:flex-row md:items-start">
                {app.iconUrl ? (
                  <img
                    src={app.iconUrl}
                    alt={app.name}
                    className="h-24 w-24 shrink-0 rounded-[28px] border border-white/15 bg-white/85 object-cover shadow-xl"
                  />
                ) : (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[28px] border border-white/15 bg-white/10 text-3xl font-black text-white shadow-xl">
                    {getInitials(app.name)}
                  </div>
                )}

                <div className="min-w-0">
                  <h1 className="text-4xl font-black tracking-tight md:text-5xl">{app.name}</h1>
                  <p className="mt-4 max-w-3xl text-base leading-8 text-sky-50/90 md:text-lg">
                    {app.tagline || app.description || '这是一个更接近正式产品页的应用详情页：先讲清楚是什么，再承接购买与交付。'}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  {
                    label: '核心亮点',
                    value: String(app.highlights.length || 0),
                    note: '帮助用户快速判断适用场景'
                  },
                  {
                    label: '价格方案',
                    value: String(offers.length || 0),
                    note: '支持购买决策与套餐比较'
                  },
                  {
                    label: '帮助入口',
                    value: String((app.links ?? []).length + (hasAiTranslateWorkflowResources ? 2 : 0)),
                    note: '文档、支持、官网与合规说明'
                  }
                ].map((item) => (
                  <div key={item.label} className="rounded-3xl border border-white/12 bg-white/10 p-4 backdrop-blur">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-50/70">{item.label}</p>
                    <p className="mt-2 text-3xl font-black tracking-tight">{item.value}</p>
                    <p className="mt-1 text-xs leading-6 text-sky-50/70">{item.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-6 border-t border-slate-200/80 bg-white p-8 lg:border-l lg:border-t-0">
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Purchase</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                  {selectedOffer?.title ?? '暂无可购买方案'}
                </h2>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  {selectedOffer?.description || '这里应该像正式产品页一样，把价格、支付方式、购买状态和下一步动作清楚交代给用户。'}
                </p>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">当前价格</p>
                <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">
                  {selectedOffer ? formatAmount(selectedOffer.priceAmount, selectedOffer.currency) : '即将开放'}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedOffer ? (selectedOffer.interval === 'month' ? '按月订阅' : selectedOffer.interval === 'year' ? '按年订阅' : '一次性') : '当前没有上架中的购买方案'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(['wechat_pay', 'alipay'] as const).map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => setProviderPreference(provider)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                      providerPreference === provider
                        ? 'border-primary bg-blue-50 text-primary shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {provider === 'wechat_pay' ? '微信支付' : '支付宝'}
                  </button>
                ))}
              </div>

              {selectedFeatures.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">本方案包含</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedFeatures.slice(0, 6).map((feature) => (
                      <span
                        key={feature}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              {isAuthenticated && user ? (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  当前已登录：{user.email}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  登录后即可直接购买，并在“我的应用”中查看授权状态。
                </div>
              )}

              <Button
                className="w-full rounded-2xl"
                size="lg"
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

              <div className="grid gap-2 sm:grid-cols-2">
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
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          {
            title: '为什么值得购买',
            desc: '详情页不仅展示卖点，还应该把“买完以后能得到什么”讲清楚。',
            icon: Sparkles
          },
          {
            title: '授权自动同步',
            desc: '支付完成后，当前账户的权限状态会统一进入授权体系，而不是分散在多个页面里。',
            icon: ShieldCheck
          },
          {
            title: '持续交付',
            desc: '购买不是终点，后续还能承接部署、交付和更新服务，这是平台前台的重要信任点。',
            icon: CreditCard
          }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} className="rounded-[28px] border-slate-200/80 bg-white/92 shadow-sm shadow-slate-900/5">
              <CardContent className="flex items-start gap-4 p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-black tracking-tight text-slate-950">{item.title}</h3>
                  <p className="text-sm leading-7 text-slate-600">{item.desc}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr),320px]">
        <div className="space-y-12">
          <section className="space-y-6">
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-500">Overview</p>
              <h2 className="text-3xl font-black tracking-tight text-slate-950">产品概览</h2>
            </div>
            <Card className="rounded-[28px] border-slate-200/80 bg-white/95 shadow-sm shadow-slate-900/5">
              <CardContent className="p-7">
                {hasContent ? (
                  <div className="prose prose-slate max-w-none prose-headings:font-black prose-a:text-primary prose-img:rounded-2xl prose-p:leading-8">
                    <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>
                      {app.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm leading-7 text-slate-500">该应用暂无详细介绍。</p>
                )}
              </CardContent>
            </Card>
          </section>

          {hasHighlights && (
            <section className="space-y-6">
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-500">Highlights</p>
                <h2 className="text-3xl font-black tracking-tight text-slate-950">核心亮点</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {app.highlights.map((highlight, idx) => (
                  <Card key={idx} className="rounded-[28px] border-slate-200/80 bg-white/95 shadow-sm shadow-slate-900/5">
                    <CardContent className="space-y-4 p-6">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-2xl text-white">
                        {highlight.icon || '✦'}
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-lg font-black tracking-tight text-slate-950">{highlight.title}</h3>
                        <p className="text-sm leading-7 text-slate-600">{highlight.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {hasScreenshots && (
            <section className="space-y-6">
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-500">Screenshots</p>
                <h2 className="text-3xl font-black tracking-tight text-slate-950">应用截图</h2>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {app.screenshots.map((screenshot, idx) => (
                  <a
                    key={idx}
                    href={screenshot.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm shadow-slate-900/5"
                  >
                    <div className="aspect-[16/10] overflow-hidden bg-slate-100">
                      <img
                        src={screenshot.url}
                        alt={screenshot.caption || `截图 ${idx + 1}`}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                      />
                    </div>
                    {screenshot.caption ? (
                      <div className="border-t border-slate-200/80 px-5 py-4 text-sm text-slate-600">
                        {screenshot.caption}
                      </div>
                    ) : null}
                  </a>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-6" id="pricing">
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-500">Plans</p>
              <h2 className="text-3xl font-black tracking-tight text-slate-950">套餐与价格</h2>
            </div>
            {offers.length === 0 ? (
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
            )}
          </section>

          {hasFaq && (
            <section className="space-y-6">
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-500">FAQ</p>
                <h2 className="text-3xl font-black tracking-tight text-slate-950">常见问题</h2>
              </div>
              <div className="space-y-3">
                {app.faq.map((item, idx) => {
                  const isOpen = openFaqIndices.has(idx);
                  return (
                    <Card key={idx} className="overflow-hidden rounded-[24px] border-slate-200/80 bg-white/95 shadow-sm shadow-slate-900/5">
                      <button
                        type="button"
                        onClick={() => toggleFaq(idx)}
                        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                      >
                        <span className="text-base font-black tracking-tight text-slate-950">{item.question}</span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {isOpen ? (
                        <div className="border-t border-slate-200/80 px-6 py-5 text-sm leading-7 text-slate-600">
                          {item.answer}
                        </div>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card className="rounded-[28px] border-slate-200/80 bg-white/95 shadow-sm shadow-slate-900/5">
            <CardHeader className="space-y-2">
              <CardTitle className="text-xl">快速摘要</CardTitle>
              <CardDescription>把用户做购买决定前最关心的信息压缩到这一栏。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-7 text-slate-600">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">当前选择</p>
                <p className="mt-2 text-lg font-black text-slate-950">{selectedOffer?.title ?? '暂无可购买方案'}</p>
                <p className="text-slate-500">
                  {selectedOffer ? formatAmount(selectedOffer.priceAmount, selectedOffer.currency) : '请稍后再试'}
                </p>
              </div>

              <div className="space-y-3">
                {[
                  '购买完成后授权自动同步到当前账户',
                  '订单与支付状态可在用户中心持续回看',
                  '部署与后续交付入口仍在同一平台内承接'
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {resourceCards.length > 0 ? (
            <Card className="rounded-[28px] border-slate-200/80 bg-white/95 shadow-sm shadow-slate-900/5">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl">资源与入口</CardTitle>
                <CardDescription>把文档、支持、官网与合规页面统一到一个区域。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {resourceCards.map((link) => {
                  const isInternal = link.url.startsWith('/');
                  const content = (
                    <div className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 transition hover:border-slate-300 hover:bg-white">
                      <div className="rounded-full border border-slate-200 bg-white p-2 text-slate-500">
                        <ExternalLink className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-950">{link.label}</p>
                          <Badge variant="outline" className="text-[10px]">{link.typeLabel}</Badge>
                        </div>
                        <p className="mt-1 text-xs leading-6 text-slate-500">{link.note}</p>
                      </div>
                    </div>
                  );

                  return isInternal ? (
                    <Link key={link.label} to={link.url}>
                      {content}
                    </Link>
                  ) : (
                    <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer">
                      {content}
                    </a>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
