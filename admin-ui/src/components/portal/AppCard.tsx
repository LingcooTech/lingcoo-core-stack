import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { AppWithDetails } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import {
  formatOfferStartingPriceLabel,
  getActiveOffers,
  getAppTypeLabel,
} from '@/lib/app-catalog-ui';
import { cn, getInitials } from '@/lib/utils';

interface AppCardProps {
  app: AppWithDetails;
  href?: string;
  footer?: ReactNode;
  className?: string;
}

function AppIdentity({ app }: { app: AppWithDetails }) {
  if (app.iconUrl) {
    return (
      <img
        src={app.iconUrl}
        alt={app.name}
        className="border-border bg-card h-12 w-12 shrink-0 rounded-lg border object-contain p-1"
      />
    );
  }

  return (
    <div className="bg-muted text-muted-foreground flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-semibold">
      {getInitials(app.name)}
    </div>
  );
}

function AppCardBody({ app }: { app: AppWithDetails }) {
  const activeOffers = getActiveOffers(app.checkoutOffers ?? []);
  const priceLabel = formatOfferStartingPriceLabel(activeOffers);

  return (
    <div className="flex h-full flex-col p-5">
      <div className="flex items-start gap-3">
        <AppIdentity app={app} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {app.category ? (
              <Badge variant="outline" className="text-muted-foreground text-[11px] font-medium">
                {app.category}
              </Badge>
            ) : null}
            <Badge variant="outline" className="text-muted-foreground text-[11px] font-medium">
              {getAppTypeLabel(app.type)}
            </Badge>
          </div>
          <h3 className="text-foreground mt-2 line-clamp-1 text-[15px] font-semibold tracking-tight">
            {app.name}
          </h3>
        </div>
      </div>

      <p className="text-muted-foreground mt-3 line-clamp-2 min-h-[40px] text-[13px] leading-6">
        {app.tagline || app.description || '应用详情暂未补充。'}
      </p>

      <div className="border-border mt-4 flex items-end justify-between gap-3 border-t pt-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-[0.12em]">
            起始价格
          </p>
          <p className="text-foreground mt-1 text-[17px] font-semibold tabular-nums leading-none">
            {priceLabel}
          </p>
        </div>
        <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
          {activeOffers.length > 0 ? `${activeOffers.length} 个方案` : '即将开放'}
        </span>
      </div>
    </div>
  );
}

export function AppCard({ app, href, footer, className }: AppCardProps) {
  const rootClassName = cn(
    'border-border hover:border-foreground/20 bg-card group overflow-hidden rounded-xl border transition-colors',
    className,
  );

  const body = <AppCardBody app={app} />;

  if (href && !footer) {
    return (
      <Link to={href} className={cn(rootClassName, 'block no-underline')}>
        {body}
      </Link>
    );
  }

  return (
    <article className={rootClassName}>
      {href ? (
        <Link to={href} className="block no-underline">
          {body}
        </Link>
      ) : (
        body
      )}
      {footer ? <div className="border-border border-t px-6 py-5">{footer}</div> : null}
    </article>
  );
}
