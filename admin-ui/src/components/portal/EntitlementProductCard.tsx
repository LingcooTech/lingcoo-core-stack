import { ArrowUpRight, Boxes, Download, KeyRound, Rocket } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { AppLink, HydratedEntitlement } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAccessLinkLabel } from '@/lib/app-catalog-ui';
import { entitlementSourceLabel, entitlementStatusLabel } from '@/lib/portal-labels';
import { formatTime } from '@/lib/utils';

function formatFeatureName(name: string): string {
  if (name.includes('_')) {
    const spaced = name.replace(/_/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }
  return name;
}

export function EntitlementProductCard({
  productName,
  featureNames,
  relatedApps,
  items,
  deploymentHref,
  accessLinks,
  appHref,
  accessState = 'active',
}: {
  productName: string;
  featureNames: string[];
  relatedApps: string[];
  items: HydratedEntitlement[];
  deploymentHref?: string;
  accessLinks?: AppLink[];
  appHref?: string;
  accessState?: 'active' | 'inactive';
}) {
  const visibleAccessLinks = (accessLinks ?? []).filter((link) => link.url.trim());
  const stateLabel = accessState === 'active' ? '有效授权' : '授权已失效';
  const activeItems = items.filter((item) => item.status === 'active');
  const latestActive = activeItems[0] ?? null;
  const validityLabel = latestActive?.expiresAt ? formatTime(latestActive.expiresAt) : '永不过期';

  return (
    <Card className="border-border/80 bg-card/95 rounded-lg shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="text-muted-foreground bg-muted rounded-lg p-3">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-xl tracking-tight">{productName}</CardTitle>
          </div>
          <Badge variant={accessState === 'active' ? 'default' : 'secondary'}>{stateLabel}</Badge>
        </div>
        {relatedApps.length ? (
          <div className="flex flex-wrap gap-2">
            {relatedApps.map((appName) => (
              <Badge key={appName} variant="secondary">
                {appName}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="border-border bg-muted/80 rounded-lg border p-4">
            <p className="text-muted-foreground text-[10px] font-semibold tracking-wide">
              当前状态
            </p>
            <p className="text-foreground mt-2 text-base font-semibold tracking-tight">
              {stateLabel}
            </p>
          </div>
          <div className="border-border bg-muted/80 rounded-lg border p-4">
            <p className="text-muted-foreground text-[10px] font-semibold tracking-wide">有效期</p>
            <p className="text-foreground mt-2 text-base font-semibold tracking-tight">
              {latestActive ? validityLabel : '暂无有效授权'}
            </p>
          </div>
          <div className="border-border bg-muted/80 rounded-lg border p-4">
            <p className="text-muted-foreground text-[10px] font-semibold tracking-wide">
              授权记录
            </p>
            <p className="text-foreground mt-2 text-2xl font-semibold tracking-tight">
              {items.length}
            </p>
          </div>
        </div>

        {featureNames.length > 0 ? (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium">已开通能力</p>
            <div className="flex flex-wrap gap-2">
              {featureNames.map((featureName) => (
                <Badge
                  key={featureName}
                  variant="secondary"
                  className="inline-flex items-center gap-1.5"
                >
                  <KeyRound className="text-muted-foreground h-3 w-3" />
                  {formatFeatureName(featureName)}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="text-muted-foreground space-y-2 text-sm">
          {items.map((item) => (
            <div key={item.id} className="border-border bg-muted/80 rounded-lg border px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-foreground font-medium">
                  {item.plan?.name ?? item.plan?.code ?? '未命名能力'}
                </span>
                <Badge variant={item.status === 'active' ? 'default' : 'secondary'}>
                  {entitlementStatusLabel(item.status)}
                </Badge>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <p className="text-xs">
                  来源：{entitlementSourceLabel(item.sourceType, item.sourceOrder?.orderNo)}
                </p>
                <p className="text-xs">
                  生效时间：{item.startsAt ? formatTime(item.startsAt) : '立即生效'}
                </p>
                <p className="text-xs">
                  到期时间：{item.expiresAt ? formatTime(item.expiresAt) : '永不过期'}
                </p>
                <p className="text-xs">创建时间：{formatTime(item.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>

        {accessState === 'inactive' ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            当前应用没有有效授权。可能是授权已过期、被撤销，或订单状态发生变化；如需继续使用，请重新购买或联系支持。
          </div>
        ) : null}

        {deploymentHref || visibleAccessLinks.length || appHref ? (
          <div className="border-border flex flex-wrap justify-end gap-3 border-t pt-4">
            {appHref ? (
              <Button asChild variant="outline" className="rounded-lg">
                <Link to={appHref}>
                  查看详情
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
            {visibleAccessLinks.map((link, index) => (
              <Button
                key={`${link.type}-${link.url}-${index}`}
                asChild
                variant={link.type === 'website' ? 'default' : 'outline'}
                className="rounded-lg"
              >
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {getAccessLinkLabel(link)}
                  {link.type === 'download' ? (
                    <Download className="h-4 w-4" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                </a>
              </Button>
            ))}
            {deploymentHref ? (
              <Button asChild className="rounded-lg">
                <Link to={deploymentHref}>
                  开始部署
                  <Rocket className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
