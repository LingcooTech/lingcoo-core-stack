import { ArrowUpRight, Boxes, Download, KeyRound, Rocket } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { AppLink, HydratedEntitlement } from '@/api/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
  const activePlanLabel = latestActive?.plan?.name ?? latestActive?.plan?.code ?? '当前有效授权';

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
                {latestActive ? `当前有效：${activePlanLabel}` : '当前暂无有效授权'}
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
        {latestActive ? (
          <div className="bg-muted/60 rounded-lg border px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs font-medium">当前有效授权</p>
                <p className="text-foreground mt-1 truncate text-base font-semibold">
                  {activePlanLabel}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">有效期：{validityLabel}</p>
              </div>
              {deploymentHref || visibleAccessLinks.length || appHref ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {appHref ? (
                    <Button asChild variant="outline" size="sm" className="rounded-lg">
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
                      size="sm"
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
                    <Button asChild size="sm" className="rounded-lg">
                      <Link to={deploymentHref}>
                        一键部署
                        <Rocket className="h-4 w-4" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            当前没有可用授权。如需继续使用，请重新购买、续费，或联系支持核对历史订单。
          </div>
        )}

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

        <Accordion type="single" collapsible className="rounded-lg border px-4">
          <AccordionItem value="history" className="border-0">
            <AccordionTrigger className="py-3 text-sm hover:no-underline">
              授权记录（{items.length}）
            </AccordionTrigger>
            <AccordionContent>
              <div className="text-muted-foreground space-y-2 text-sm">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="border-border bg-muted/60 rounded-lg border px-4 py-3"
                  >
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
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
