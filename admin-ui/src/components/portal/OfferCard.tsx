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
  selected: boolean;
  features: string[];
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-2xl border p-5 text-left transition ${
        selected ? 'border-primary bg-blue-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-lg font-black">{offer.title}</p>
            {offer.badge ? <Badge>{offer.badge}</Badge> : null}
            {offer.isDefault ? <Badge variant="secondary">推荐</Badge> : null}
          </div>
          {offer.description ? <p className="text-sm text-muted-foreground">{offer.description}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-2xl font-black">{formatAmount(offer.priceAmount, offer.currency)}</p>
          <p className="text-xs tracking-wide text-muted-foreground">{formatInterval(offer.interval)}</p>
        </div>
      </div>
      {features.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {features.map((feature) => (
            <span key={feature} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              {feature}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}
