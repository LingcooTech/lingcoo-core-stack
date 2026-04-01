import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, LoaderCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { getAppCatalog } from '@/api/apps';
import { createCheckoutSession } from '@/api/user';
import { EmptyState } from '@/components/portal/EmptyState';
import { OfferCard } from '@/components/portal/OfferCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { formatAmount } from '@/lib/utils';

export function AppCatalogPage() {
  const params = useParams<{ appCode: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [providerPreference, setProviderPreference] = useState<'wechat_pay' | 'alipay'>('wechat_pay');
  const [selectedOfferCode, setSelectedOfferCode] = useState<string>('');

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
        throw new Error('当前没有可购买的套餐');
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
      toast.error(err instanceof Error ? err.message : '创建支付会话失败');
    }
  });

  const startCheckout = () => {
    if (!isAuthenticated) {
      navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    checkoutMutation.mutate();
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
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">应用不存在，或当前未开放购买。</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Button variant="ghost" asChild className="px-0 text-muted-foreground">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              返回产品中心
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight">{data.app.name}</h1>
            <Badge variant="outline">{data.app.type}</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {data.app.description || '该应用已经接入 FD Stack 的统一认证、支付与授权体系。'}
          </p>
        </div>
        <div className="hidden xl:block">
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">App Code</p>
            <p className="mt-2 text-sm font-black text-slate-900">{data.app.code}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">用户侧只暴露产品信息与购买入口，后台配置仍保留在 /admin。</p>
          </div>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>套餐与价格</CardTitle>
              <CardDescription>统一购买后，授权会进入同一个用户控制台；系统类产品可以继续在部署中心完成交付。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {offers.length === 0 ? (
                <EmptyState
                  icon={CreditCard}
                  title="当前没有可购买的套餐"
                  description="先在后台为这个应用配置 checkout offers，用户侧才会展示具体价格方案。"
                />
              ) : (
                offers.map((offer) => (
                  <OfferCard
                    key={offer.code}
                    offer={offer}
                    selected={selectedOffer?.code === offer.code}
                    features={planFeatureMap.get(offer.planId) ?? []}
                    onSelect={() => setSelectedOfferCode(offer.code)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-slate-200/80">
            <CardHeader>
              <CardTitle>购买方式</CardTitle>
              <CardDescription>使用现有支付接口创建托管 checkout，会话创建后自动跳转到支付页。</CardDescription>
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
                <p className="mt-2 text-lg font-black">{selectedOffer?.title ?? '未配置套餐'}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedOffer ? formatAmount(selectedOffer.priceAmount, selectedOffer.currency) : '暂无价格'}
                </p>
              </div>

              <Button className="w-full" size="lg" onClick={startCheckout} disabled={!selectedOffer || checkoutMutation.isPending}>
                {checkoutMutation.isPending ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    创建支付会话中...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" />
                    {isAuthenticated ? '继续支付' : '登录后继续支付'}
                  </>
                )}
              </Button>

              <p className="text-xs leading-6 text-muted-foreground">
                支付成功后，授权会写入 FD Stack。对于 Chrome 扩展、工具应用、小程序会直接生效；对于 Headless WP
                系统，后续可直接进入部署中心创建部署记录并签发一键安装命令。
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
