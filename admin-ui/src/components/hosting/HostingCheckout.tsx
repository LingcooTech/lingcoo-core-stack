import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { createCheckoutSession } from '@/api/user';
import { Button } from '@/components/ui/button';
import { OrderItems } from '@/components/shared/OrderItems';
import { formatAmount } from '@/lib/utils';

export function HostingCheckout({
  appCode,
  planCode,
  entitlementId,
  deploymentId,
}: {
  appCode: string;
  planCode: string;
  entitlementId: string;
  deploymentId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="rounded-lg border bg-card p-4 text-sm"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">
        {deploymentId ? '托管续费' : '单独购买托管服务'}
      </summary>
      {open && (
        <HostingCheckoutForm
          key={`${entitlementId}:${deploymentId ?? 'new'}`}
          appCode={appCode}
          planCode={planCode}
          entitlementId={entitlementId}
          deploymentId={deploymentId}
        />
      )}
    </details>
  );
}
function HostingCheckoutForm({
  appCode,
  planCode,
  entitlementId,
  deploymentId,
}: {
  appCode: string;
  planCode: string;
  entitlementId: string;
  deploymentId?: string;
}) {
  const [offerId, setOfferId] = useState('');
  const [provider, setProvider] = useState<'wechat_pay' | 'alipay'>('wechat_pay');
  const offers = useQuery({
    queryKey: ['purchasable-hosting', appCode],
    queryFn: () =>
      apiClient(
        'GET /v1/billing/hosting-offers/:appCode',
        `/v1/billing/hosting-offers/${encodeURIComponent(appCode)}`,
      ),
  });
  const service = useQuery({
    queryKey: ['hosting-service', false, deploymentId],
    queryFn: () =>
      apiClient(
        'GET /v1/deployments/:deploymentId/hosting-service',
        `/v1/deployments/${deploymentId}/hosting-service`,
      ),
    enabled: Boolean(deploymentId),
  });
  const compatible =
    offers.data?.items.filter(
      (o) =>
        !deploymentId ||
        (service.data?.service?.source === 'paid' &&
          o.interval === service.data.service.interval &&
          o.graceDays === service.data.service.graceDays &&
          o.retentionDays === service.data.service.retentionDays),
    ) ?? [];
  const selected = compatible.find((o) => o.id === offerId);
  const purchase = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('请选择可购买的托管套餐');
      return createCheckoutSession({
        appCode,
        planCode,
        hosting: { offerId: selected.id, version: selected.version },
        hostingOnly: { entitlementId, ...(deploymentId ? { deploymentId } : {}) },
        providerPreference: provider,
        successUrl: `${window.location.origin}/account?tab=orders`,
        cancelUrl: `${window.location.origin}/deploy?app=${encodeURIComponent(appCode)}`,
      });
    },
  });
  if (offers.isPending || (deploymentId && service.isPending))
    return <p className="mt-3 text-muted-foreground">正在读取托管套餐…</p>;
  if (offers.isError || (deploymentId && service.isError))
    return (
      <p role="alert" className="mt-3 text-destructive">
        读取失败，请关闭后重新打开。
      </p>
    );
  return (
    <div className="mt-3 space-y-3">
      <p className="text-muted-foreground">
        {deploymentId
          ? '仅为当前实例续费，不新增软件授权或部署名额。续费沿用当前计费周期、宽限和保留政策。'
          : '你已拥有软件授权，本次只支付托管费用。购买后在上方选择已购买服务，首次交付后开始计时；不会增加软件部署名额。'}
        不自动扣费。
      </p>
      {purchase.data ? (
        <>
          <OrderItems items={purchase.data.order.items} />
          <Button asChild>
            <a href={purchase.data.presentation.url}>打开收银台</a>
          </Button>
          <p className="text-xs text-muted-foreground">
            订单已创建，付款后才会发放托管服务或延长期限。
          </p>
        </>
      ) : (
        <>
          {!compatible.length ? (
            <p className="text-muted-foreground">
              暂无符合条件的已上架套餐，请联系平台确认服务安排。
            </p>
          ) : (
            <>
              <label className="block space-y-1">
                托管套餐
                <select
                  aria-label="托管套餐"
                  className="h-10 w-full rounded-md border bg-background px-2"
                  value={offerId}
                  onChange={(e) => setOfferId(e.target.value)}
                >
                  <option value="">请选择套餐</option>
                  {compatible.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title} · {formatAmount(o.priceAmount, o.currency)} /{' '}
                      {o.interval === 'month' ? '月' : '年'}
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <p className="text-muted-foreground">
                  {selected.description} · 宽限 {selected.graceDays} 天，停服后保留{' '}
                  {selected.retentionDays} 天。本次合计{' '}
                  {formatAmount(selected.priceAmount, selected.currency)}。
                </p>
              )}
              <label className="block space-y-1">
                支付方式
                <select
                  aria-label="托管支付方式"
                  className="h-10 w-full rounded-md border bg-background px-2"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as typeof provider)}
                >
                  <option value="wechat_pay">微信支付</option>
                  <option value="alipay">支付宝</option>
                </select>
              </label>
              <Button disabled={!selected || purchase.isPending} onClick={() => purchase.mutate()}>
                {purchase.isPending ? '正在创建订单…' : '创建托管订单'}
              </Button>
            </>
          )}
          {purchase.isError && (
            <p role="alert" className="text-destructive">
              {purchase.error.message}
            </p>
          )}
        </>
      )}
    </div>
  );
}
