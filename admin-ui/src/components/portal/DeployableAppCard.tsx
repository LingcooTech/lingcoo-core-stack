import { ArrowRight, ServerCog } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { AppWithDetails } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function DeployableAppCard({
  app,
  featureCount
}: {
  app: AppWithDetails;
  featureCount: number;
}) {
  return (
    <Card className="border-slate-200/80 bg-white/95">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
              <ServerCog className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>{app.name}</CardTitle>
              <CardDescription>{app.code}</CardDescription>
            </div>
          </div>
          <Badge variant="outline">{app.type}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {app.description || '该系统产品已接入统一授权体系，可作为后续部署链路的首个承载对象。'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{featureCount} 个有效能力</Badge>
          <Badge variant="secondary">{app.checkoutOffers?.length ?? 0} 个可售套餐</Badge>
        </div>
        <Button asChild className="w-full">
          <Link to={`/apps/${app.code}`}>
            继续查看购买与交付入口
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
