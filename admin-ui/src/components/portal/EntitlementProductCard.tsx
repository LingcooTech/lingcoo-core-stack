import { Boxes, KeyRound } from 'lucide-react';

import type { HydratedAuthorizationGrant } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTime } from '@/lib/utils';

function formatAuthorizationTemplateName(name: string): string {
  if (name.includes('_')) {
    const spaced = name.replace(/_/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }
  return name;
}

export function EntitlementProductCard({
  productName,
  authorizationTemplateNames,
  relatedApps,
  items
}: {
  productName: string;
  authorizationTemplateNames: string[];
  relatedApps: string[];
  items: HydratedAuthorizationGrant[];
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
          {authorizationTemplateNames.map((authorizationTemplateName) => (
            <Badge key={authorizationTemplateName} variant="secondary" className="inline-flex items-center gap-1.5">
              <KeyRound className="h-3 w-3 text-emerald-600" />
              {formatAuthorizationTemplateName(authorizationTemplateName)}
            </Badge>
          ))}
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-800">
                  {item.authorizationTemplate?.name ?? item.authorizationTemplate?.code ?? '未命名授权档位'}
                </span>
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
