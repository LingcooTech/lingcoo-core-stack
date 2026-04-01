import { Boxes, KeyRound } from 'lucide-react';

import type { HydratedEntitlement } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTime } from '@/lib/utils';

export function EntitlementProductCard({
  productCode,
  productName,
  featureCodes,
  relatedApps,
  items
}: {
  productCode: string;
  productName: string;
  featureCodes: string[];
  relatedApps: string[];
  items: HydratedEntitlement[];
}) {
  return (
    <Card className="border-slate-200/80 bg-white/95">
      <CardHeader className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-blue-50 p-3 text-primary">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>{productName}</CardTitle>
            <p className="text-sm text-muted-foreground">{productCode}</p>
          </div>
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
        <div className="flex flex-wrap gap-2">
          {featureCodes.map((featureCode) => (
            <span key={featureCode} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              <KeyRound className="h-3.5 w-3.5 text-emerald-600" />
              {featureCode}
            </span>
          ))}
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-800">{item.feature?.name ?? item.feature?.code ?? '未命名能力'}</span>
                <Badge variant={item.status === 'active' ? 'default' : 'secondary'}>{item.status}</Badge>
              </div>
              <p className="mt-1 text-xs">生效时间：{item.startsAt ? formatTime(item.startsAt) : '立即生效'}</p>
              <p className="text-xs">到期时间：{item.expiresAt ? formatTime(item.expiresAt) : '永不过期'}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
