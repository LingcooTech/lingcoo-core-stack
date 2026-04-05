import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, CreditCard, ExternalLink, LoaderCircle } from 'lucide-react';
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
  const { isAuthenticated } = useAuth();
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
  const hasLinks = app.links && app.links.length > 0;

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="space-y-6 pt-4">
        <Button variant="ghost" asChild className="px-0 text-muted-foreground">
          <Link to="/">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回应用中心
          </Link>
        </Button>
        <div className="flex items-start gap-6">
          {app.iconUrl ? (
            <img
              src={app.iconUrl}
              alt={app.name}
              className="h-20 w-20 shrink-0 rounded-3xl object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 text-2xl font-bold text-white shadow-sm">
              {getInitials(app.name)}
            </div>
          )}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-slate-950">{app.name}</h1>
              {app.category && (
                <Badge variant="secondary" className="rounded-full">
                  {app.category}
                </Badge>
              )}
            </div>
            <p className="max-w-2xl text-lg text-muted-foreground">
              {app.tagline || app.description || '优质应用，等你体验。'}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-12 lg:grid-cols-[1fr,380px]">
        {/* Main Content Column */}
        <div className="space-y-12">
          {/* Highlights Section */}
          {hasHighlights && (
            <section className="space-y-6">
              <h2 className="text-2xl font-black tracking-tight text-slate-950">产品亮点</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {app.highlights.map((highlight, idx) => (
                  <Card key={idx} className="border-slate-200/80 bg-white/95">
                    <CardHeader className="space-y-2 pb-2">
                      {highlight.icon && (
                        <span className="text-2xl">{highlight.icon}</span>
                      )}
                      <CardTitle className="text-base">{highlight.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-sm leading-relaxed">
                        {highlight.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Screenshots Section */}
          {hasScreenshots && (
            <section className="space-y-6">
              <h2 className="text-2xl font-black tracking-tight text-slate-950">应用截图</h2>
              <div className="flex gap-4 overflow-x-auto pb-4">
                {app.screenshots.map((screenshot, idx) => (
                  <a
                    key={idx}
                    href={screenshot.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group shrink-0"
                  >
                    <div className="overflow-hidden rounded-xl border border-slate-200 transition group-hover:shadow-md">
                      <img
                        src={screenshot.url}
                        alt={screenshot.caption || `截图 ${idx + 1}`}
                        className="h-48 w-auto max-w-xs object-cover transition group-hover:scale-[1.02]"
                      />
                    </div>
                    {screenshot.caption && (
                      <p className="mt-2 text-xs text-muted-foreground">{screenshot.caption}</p>
                    )}
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Content Section (Markdown) */}
          <section className="space-y-6">
            <h2 className="text-2xl font-black tracking-tight text-slate-950">详细介绍</h2>
            {hasContent ? (
              <div className="prose prose-slate max-w-none prose-headings:font-black prose-a:text-primary prose-img:rounded-xl">
                <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>
                  {app.content}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">该应用暂无详细介绍</p>
            )}
          </section>

          {/* Pricing Section */}
          <section id="pricing" className="space-y-6">
            <h2 className="text-2xl font-black tracking-tight text-slate-950">套餐与价格</h2>
            {offers.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="暂无可购买的套餐"
                description="该应用目前没有上架的价格方案，请稍后再来查看。"
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

          {/* FAQ Section */}
          {hasFaq && (
            <section className="space-y-6">
              <h2 className="text-2xl font-black tracking-tight text-slate-950">常见问题</h2>
              <div className="space-y-2">
                {app.faq.map((item, idx) => {
                  const isOpen = openFaqIndices.has(idx);
                  return (
                    <div key={idx} className="rounded-xl border border-slate-200 bg-white/95">
                      <button
                        type="button"
                        onClick={() => toggleFaq(idx)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                      >
                        <span className="text-sm font-bold text-slate-900">{item.question}</span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className="border-t border-slate-100 px-5 py-4">
                          <p className="text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Links Section */}
          {hasLinks && (
            <section className="space-y-6">
              <h2 className="text-2xl font-black tracking-tight text-slate-950">相关链接</h2>
              <div className="space-y-2">
                {app.links.map((link, idx) => (
                  <a
                    key={idx}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-5 py-3.5 text-sm transition hover:border-slate-300 hover:shadow-sm"
                  >
                    <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium text-slate-900">{link.label}</span>
                    <Badge variant="outline" className="ml-auto rounded-full text-xs">
                      {link.type === 'docs' ? '文档' :
                       link.type === 'support' ? '支持' :
                       link.type === 'website' ? '官网' :
                       link.type === 'download' ? '下载' : '链接'}
                    </Badge>
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Checkout Sidebar (sticky on desktop) */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card className="border-slate-200/80">
            <CardHeader>
              <CardTitle>购买</CardTitle>
              <CardDescription>选择支付方式，完成购买后即可使用</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setProviderPreference('wechat_pay')}
                  className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                    providerPreference === 'wechat_pay' ? 'border-primary bg-blue-50 text-primary' : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  微信支付
                </button>
                <button
                  type="button"
                  onClick={() => setProviderPreference('alipay')}
                  className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                    providerPreference === 'alipay' ? 'border-primary bg-blue-50 text-primary' : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  支付宝
                </button>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">当前选择</p>
                <p className="mt-2 text-lg font-black">{selectedOffer?.title ?? '请选择套餐'}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedOffer ? formatAmount(selectedOffer.priceAmount, selectedOffer.currency) : '暂无价格'}
                </p>
              </div>

              {offers.length > 0 && (
                <a href="#pricing" className="block text-center text-xs text-muted-foreground hover:text-primary">
                  查看全部套餐与价格
                </a>
              )}

              <Button className="w-full" size="lg" onClick={startCheckout} disabled={!selectedOffer || checkoutMutation.isPending}>
                {checkoutMutation.isPending ? (
                  <>
                    <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
                    正在跳转支付...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-1 h-4 w-4" />
                    {isAuthenticated ? '立即购买' : '登录后购买'}
                  </>
                )}
              </Button>

              <p className="text-xs leading-6 text-muted-foreground">
                支付成功后，相关权限将自动生效。你可以在「我的应用」中查看已购内容和授权状态。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
