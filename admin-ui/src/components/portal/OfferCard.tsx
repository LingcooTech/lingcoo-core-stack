import { Check } from 'lucide-react';

import type { AppCatalog } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { formatAmount } from '@/lib/utils';

type Offer = AppCatalog['offers'][number];

function formatInterval(interval: string): string {
  switch (interval) {
    case 'month':
      return '/ 月';
    case 'year':
      return '/ 年';
    case 'one_time':
      return '一次性';
    default:
      return interval;
  }
}

export function OfferCard({
  offer,
  selected,
  features,
  onSelect
}: {
  offer: Offer;
  selected?: boolean;
  features: string[];
  onSelect?: () => void;
}) {
  const interactive = typeof onSelect === 'function';

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onSelect}
      className={`rounded-lg border p-6 text-left transition-all duration-300 ${
        selected
          ? 'border-primary bg-blue-50/70 shadow-lg shadow-blue-500/10 ring-1 ring-primary/10'
          : interactive
            ? 'border-gray-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg hover:shadow-gray-900/5'
            : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-semibold tracking-tight text-gray-900">{offer.title}</p>
            {offer.badge ? <Badge>{offer.badge}</Badge> : null}
            {offer.isDefault ? <Badge variant="secondary">推荐</Badge> : null}
          </div>
          {offer.description ? <p className="max-w-2xl text-sm leading-7 text-muted-foreground">{offer.description}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold tracking-tight text-gray-900">{formatAmount(offer.priceAmount, offer.currency)}</p>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{formatInterval(offer.interval)}</p>
        </div>
      </div>
      {features.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {features.map((feature) => (
            <span key={feature} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              {feature}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
