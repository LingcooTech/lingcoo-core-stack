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
    <Card className="rounded-[28px] border-slate-200/80 bg-white/95 shadow-sm shadow-slate-900/5 transition hover:-translate-y-0.5 hover:shadow-lg">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
              <ServerCog className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-xl tracking-tight">{app.name}</CardTitle>
              <CardDescription>{app.code}</CardDescription>
            </div>
          </div>
          <Badge variant="outline">{app.type}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-7 text-muted-foreground">
          {app.description || '该系统产品已接入统一授权体系，可作为后续部署链路的首个承载对象。'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">有效能力</p>
            <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{featureCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">可售套餐</p>
            <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{app.checkoutOffers?.length ?? 0}</p>
          </div>
        </div>
        <Button asChild className="w-full rounded-2xl">
          <Link to={`/apps/${app.code}`}>
            继续查看购买与交付入口
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
