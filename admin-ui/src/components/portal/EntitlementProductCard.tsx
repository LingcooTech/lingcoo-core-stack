import { ArrowUpRight, Boxes, Download, KeyRound, Rocket } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { AppLink, HydratedEntitlement } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card className="border-border/80 bg-card/95 overflow-hidden rounded-lg shadow-sm">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="text-muted-foreground bg-muted rounded-lg p-3">
              <Boxes className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="truncate text-xl tracking-tight">{productName}</CardTitle>
              <CardDescription>
                {items.length} 条授权记录 ·{' '}
                {latestActive ? `当前授权有效至 ${validityLabel}` : '当前暂无有效授权'}
              </CardDescription>
            </div>
          </div>
          <Badge
            variant={accessState === 'active' ? 'default' : 'secondary'}
            className="w-fit shrink-0"
          >
            {stateLabel}
          </Badge>
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
        {accessState === 'inactive' ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            当前没有可用授权。如需继续使用，请重新购买、续费，或联系支持核对历史订单。
          </div>
        ) : null}

        {deploymentHref || visibleAccessLinks.length || appHref ? (
          <div className="bg-muted/60 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
            <p className="text-muted-foreground text-sm">
              {deploymentHref
                ? '该产品支持一键部署，可直接进入部署流程。'
                : '使用入口已同步到当前账户。'}
            </p>
            <div className="flex flex-wrap justify-end gap-3">
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
          </div>
        ) : null}

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

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-foreground text-sm font-semibold">授权历史</p>
            <span className="text-muted-foreground text-xs">{items.length} 条记录</span>
          </div>
          <div className="text-muted-foreground space-y-2 text-sm">
            {items.map((item) => (
              <div key={item.id} className="border-border bg-muted/60 rounded-lg border px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-foreground font-medium">
                    {item.plan?.name ?? item.plan?.code ?? '未命名授权'}
                  </span>
                  <Badge variant={item.status === 'active' ? 'default' : 'secondary'}>
                    {entitlementStatusLabel(item.status)}
                  </Badge>
                </div>
                <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">来源</dt>
                    <dd className="text-foreground mt-0.5">
                      {entitlementSourceLabel(item.sourceType, item.sourceOrder?.orderNo)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">有效期</dt>
                    <dd className="text-foreground mt-0.5">
                      {item.expiresAt ? formatTime(item.expiresAt) : '永不过期'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">生效时间</dt>
                    <dd className="text-foreground mt-0.5">
                      {item.startsAt ? formatTime(item.startsAt) : '立即生效'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">创建时间</dt>
                    <dd className="text-foreground mt-0.5">{formatTime(item.createdAt)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
