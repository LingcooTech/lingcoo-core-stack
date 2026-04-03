import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { AppWithDetails } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatAmount, getInitials } from '@/lib/utils';

export function AppCard({ app }: { app: AppWithDetails }) {
  const activeOffers = (app.checkoutOffers ?? []).filter((o) => o.status === 'active');
  const minPrice = activeOffers.length > 0
    ? activeOffers.reduce((min, o) => (o.priceAmount < min.priceAmount ? o : min), activeOffers[0])
    : null;

  return (
    <Card className="flex flex-col overflow-hidden border-slate-200/80 bg-white/95 transition hover:shadow-md">
      <CardHeader className="space-y-4">
        <div className="flex items-start gap-4">
          {app.iconUrl ? (
            <img
              src={app.iconUrl}
              alt={app.name}
              className="h-14 w-14 shrink-0 rounded-2xl object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white">
              {getInitials(app.name)}
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-lg leading-tight">{app.name}</CardTitle>
            <CardDescription className="line-clamp-2">
              {app.tagline || app.description || '优质产品，等你体验。'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="mt-auto space-y-4">
        <div className="flex items-center justify-between gap-2">
          {app.category ? (
            <Badge variant="secondary" className="rounded-full">
              {app.category}
            </Badge>
          ) : (
            <span />
          )}
          {minPrice && (
            <span className="text-sm font-semibold text-slate-700">
              起步价 {formatAmount(minPrice.priceAmount, minPrice.currency)}
            </span>
          )}
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link to={`/apps/${app.code}`}>
            查看产品
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
