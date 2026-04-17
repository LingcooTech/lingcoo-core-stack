import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  LoaderCircle,
  QrCode,
  RefreshCcw,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import type { AppCatalog } from '@/api/types';
import {
  createCheckoutSession,
  getCheckoutSessionPublic,
  getCheckoutSessionStatus,
  reconcileCheckoutSession,
} from '@/api/user';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatOfferCycleLabel, formatOfferPriceLabel } from '@/lib/app-catalog-ui';
import { formatTime } from '@/lib/utils';

type Offer = AppCatalog['offers'][number];

interface AppPurchaseDialogProps {
  appCode: string;
  appName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: Offer | null;
  websiteUrl?: string | null;
  onPaymentSuccess?: () => void;
}

export function AppPurchaseDialog({
  appCode,
  appName,
  open,
  onOpenChange,
  offer,
  websiteUrl,
  onPaymentSuccess,
}: AppPurchaseDialogProps) {
  const [providerPreference, setProviderPreference] = useState<'wechat_pay' | 'alipay'>('wechat_pay');
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [externalPaymentOpened, setExternalPaymentOpened] = useState(false);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!offer) {
        throw new Error('请先选择一个套餐');
      }

      return createCheckoutSession({
        appCode,
        planCode: offer.planCode,
        offerCode: offer.code,
        providerPreference,
        successUrl: `${window.location.origin}/orders`,
        cancelUrl: `${window.location.origin}/apps/${appCode}`,
      });
    },
    onSuccess: (result) => {
      setSessionCode(result.sessionCode);
      setExternalPaymentOpened(false);
    },
  });

  const publicSessionQuery = useQuery({
    queryKey: ['checkout-session-public', sessionCode],
    queryFn: () => getCheckoutSessionPublic(sessionCode ?? ''),
    enabled: open && Boolean(sessionCode),
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 3000 : false),
  });

  const statusQuery = useQuery({
    queryKey: ['checkout-session-status', sessionCode],
    queryFn: () => getCheckoutSessionStatus(sessionCode ?? ''),
    enabled: open && Boolean(sessionCode),
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 3000 : false),
  });

  const reconcileMutation = useMutation({
    mutationFn: () => reconcileCheckoutSession(sessionCode ?? ''),
    onSuccess: () => {
      void publicSessionQuery.refetch();
      void statusQuery.refetch();
    },
  });

  const effectiveStatus = statusQuery.data?.status ?? publicSessionQuery.data?.status ?? checkoutMutation.data?.status;
  const isPaid = effectiveStatus === 'paid';

  const paymentAction = publicSessionQuery.data?.paymentAction ?? null;

  const statusLabel = useMemo(() => {
    if (effectiveStatus === 'paid') return '支付完成';
    if (effectiveStatus === 'expired') return '支付已过期';
    if (effectiveStatus === 'failed') return '支付失败';
    if (effectiveStatus === 'cancelled') return '支付已取消';
    if (effectiveStatus === 'pending') return '等待支付';
    return '创建订单';
  }, [effectiveStatus]);

  const resetDialog = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSessionCode(null);
      setExternalPaymentOpened(false);
      checkoutMutation.reset();
    }
    onOpenChange(nextOpen);
  };

  const openRedirectPayment = () => {
    if (paymentAction?.type !== 'redirect_url') {
      return;
    }
    window.open(paymentAction.url, '_blank', 'noopener,noreferrer');
    setExternalPaymentOpened(true);
  };

  return (
    <Dialog open={open} onOpenChange={resetDialog}>
      <DialogContent className="max-w-2xl rounded-[24px] border-gray-200 p-0">
        <DialogHeader className="border-b border-gray-200 px-6 py-5">
          <DialogTitle className="text-xl font-semibold text-gray-900">购买 {appName}</DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            {sessionCode ? '订单已创建，请在当前弹窗内完成支付。' : '确认套餐后再选择支付方式。'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-6 py-6">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr),240px]">
            <div className="rounded-[20px] border border-gray-200 bg-gray-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">当前套餐</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">
                {offer?.title ?? '暂无可购买方案'}
              </h3>
              <p className="mt-3 text-4xl font-bold text-gray-900">{formatOfferPriceLabel(offer)}</p>
              <p className="mt-1 text-sm text-gray-500">{formatOfferCycleLabel(offer)}</p>
              {offer?.description ? (
                <p className="mt-4 text-sm leading-6 text-gray-600">{offer.description}</p>
              ) : null}
            </div>

            <div className="rounded-[20px] border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">订单状态</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">{statusLabel}</p>
              <div className="mt-4 space-y-3 text-sm text-gray-600">
                <div className="flex items-center justify-between gap-4">
                  <span>订单号</span>
                  <span className="font-medium text-gray-900">
                    {publicSessionQuery.data?.order.orderNo ?? checkoutMutation.data?.order.orderNo ?? '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>支付方式</span>
                  <span className="font-medium text-gray-900">
                    {providerPreference === 'wechat_pay' ? '微信支付' : '支付宝'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>过期时间</span>
                  <span className="font-medium text-gray-900">
                    {formatTime(publicSessionQuery.data?.expiresAt ?? checkoutMutation.data?.expiresAt ?? null)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {!sessionCode ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">支付方式</p>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { value: 'wechat_pay', label: '微信支付' },
                    { value: 'alipay', label: '支付宝' },
                  ] as const).map((provider) => (
                    <button
                      key={provider.value}
                      type="button"
                      onClick={() => setProviderPreference(provider.value)}
                      className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${
                        providerPreference === provider.value
                          ? 'border-sky-200 bg-sky-50 text-sky-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {provider.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  className="rounded-2xl"
                  disabled={!offer || checkoutMutation.isPending}
                  onClick={() => checkoutMutation.mutate()}
                >
                  {checkoutMutation.isPending ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      创建订单中...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      创建订单
                    </>
                  )}
                </Button>

                {websiteUrl ? (
                  <Button variant="outline" className="rounded-2xl" asChild>
                    <a href={websiteUrl} target="_blank" rel="noopener noreferrer">
                      演示地址
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-[20px] border border-gray-200 bg-white p-5">
                {publicSessionQuery.isLoading ? (
                  <div className="flex min-h-[220px] items-center justify-center">
                    <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : isPaid ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
                      <CheckCircle2 className="h-7 w-7" />
                    </div>
                    <h3 className="mt-4 text-xl font-semibold text-gray-900">支付已完成</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-500">
                      权益已同步到你的账户，可以前往订单页或我的应用继续查看。
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                      <Button
                        className="rounded-2xl"
                        onClick={() => {
                          resetDialog(false);
                          onPaymentSuccess?.();
                          window.location.href = publicSessionQuery.data?.successUrl || '/orders';
                        }}
                      >
                        查看订单
                      </Button>
                      <Button variant="outline" className="rounded-2xl" onClick={() => resetDialog(false)}>
                        留在当前页面
                      </Button>
                    </div>
                  </div>
                ) : paymentAction?.type === 'qr_code' ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-700">
                      <QrCode className="h-6 w-6" />
                    </div>
                    <img
                      src={paymentAction.qrCodeDataUrl}
                      alt="支付二维码"
                      className="h-56 w-56 rounded-2xl border border-gray-200 bg-white p-3"
                    />
                    <p className="mt-4 text-sm text-gray-600">请使用微信扫描二维码完成支付</p>
                  </div>
                ) : paymentAction?.type === 'redirect_url' ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-700">
                      <CreditCard className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">打开支付宝支付窗口</h3>
                    <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
                      支付宝会在新窗口中完成支付，支付完成后当前弹窗会自动刷新状态。
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                      <Button className="rounded-2xl" onClick={openRedirectPayment}>
                        打开支付窗口
                      </Button>
                      {externalPaymentOpened ? (
                        <Button
                          variant="outline"
                          className="rounded-2xl"
                          disabled={reconcileMutation.isPending}
                          onClick={() => reconcileMutation.mutate()}
                        >
                          {reconcileMutation.isPending ? (
                            <>
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                              验单中...
                            </>
                          ) : (
                            <>
                              <RefreshCcw className="h-4 w-4" />
                              我已支付，刷新状态
                            </>
                          )}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                    <p className="text-sm text-gray-500">正在准备支付动作，请稍候。</p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                <span>订单号 {publicSessionQuery.data?.order.orderNo ?? checkoutMutation.data?.order.orderNo}</span>
                <span className="hidden text-gray-300 sm:inline">|</span>
                <span>
                  实付 {publicSessionQuery.data?.order.amountYuan ?? ((offer?.priceAmount ?? 0) / 100).toFixed(2)} 元
                </span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
