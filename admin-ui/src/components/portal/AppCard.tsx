import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { AppWithDetails } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AppCard({ app }: { app: AppWithDetails }) {
  return (
    <Card className="overflow-hidden border-slate-200/80 bg-white/95">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Badge variant="outline" className="rounded-full">
            {app.type}
          </Badge>
          <span className="text-xs text-muted-foreground">{app.checkoutOffers?.length ?? 0} 个价格方案</span>
        </div>
        <div>
          <CardTitle className="text-lg">{app.name}</CardTitle>
          <CardDescription className="mt-2 min-h-10">
            {app.description || '该应用已经接入 FD Stack 的认证、支付与授权能力。'}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(app.checkoutOffers ?? []).slice(0, 3).map((offer) => (
            <Badge key={offer.code} variant={offer.isDefault ? 'default' : 'secondary'}>
              {offer.title}
            </Badge>
          ))}
        </div>
        <Button asChild className="w-full">
          <Link to={`/apps/${app.code}`}>
            查看套餐与授权入口
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
