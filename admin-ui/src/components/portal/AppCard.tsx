import { ArrowRight, Boxes, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { AppWithDetails } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatAmount, getInitials } from '@/lib/utils';

export function AppCard({ app }: { app: AppWithDetails }) {
  const activeOffers = (app.checkoutOffers ?? []).filter((offer) => offer.status === 'active');
  const minPrice = activeOffers.length > 0
    ? activeOffers.reduce((min, offer) => (offer.priceAmount < min.priceAmount ? offer : min), activeOffers[0])
    : null;
  const featureCount = app.highlights?.length ?? 0;
  const priceLabel = minPrice ? formatAmount(minPrice.priceAmount, minPrice.currency) : '即将开放';

  return (
    <Card className="group overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-sm shadow-slate-900/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/10">
      <div className="relative h-32 overflow-hidden border-b border-slate-200/70 bg-gradient-to-br from-slate-950 via-slate-800 to-sky-700">
        {app.coverUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-30 transition duration-500 group-hover:scale-105"
            style={{ backgroundImage: `url(${app.coverUrl})` }}
          />
        ) : null}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(125,211,252,0.34),_transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.04),transparent_65%)]" />
        <div className="relative flex h-full items-start justify-between gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            {app.category ? (
              <Badge className="bg-white/14 text-white hover:bg-white/14">{app.category}</Badge>
            ) : null}
            <Badge className="bg-white/10 text-white hover:bg-white/10">
              {app.type === 'extension' ? 'Extension' : app.type}
            </Badge>
          </div>
          <div className="rounded-full border border-white/10 bg-white/10 p-2 text-white/90">
            <Boxes className="h-4 w-4" />
          </div>
        </div>
      </div>

      <CardContent className="space-y-5 p-6">
        <div className="flex items-start gap-4">
          {app.iconUrl ? (
            <img
              src={app.iconUrl}
              alt={app.name}
              className="h-16 w-16 shrink-0 rounded-[22px] bg-slate-50 object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-slate-950 via-slate-700 to-sky-600 text-lg font-black text-white shadow-sm">
              {getInitials(app.name)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-black tracking-tight text-slate-950 transition-colors group-hover:text-blue-600">
              {app.name}
            </h3>
            <p className="mt-2 line-clamp-3 text-sm leading-7 text-slate-600">
              {app.tagline || app.description || '优质应用，等你体验。'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
            {featureCount} 项亮点
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
            {activeOffers.length > 0 ? `${activeOffers.length} 个方案` : '即将开放'}
          </span>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">起始价格</p>
            <p className="text-2xl font-black tracking-tight text-slate-950">{priceLabel}</p>
          </div>
          <Button asChild className="shrink-0 rounded-2xl">
            <Link to={`/apps/${app.code}`}>
              查看详情
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
