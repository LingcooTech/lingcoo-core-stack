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
        className="h-12 w-12 shrink-0 rounded-lg border border-border bg-card object-contain p-1"
      />
    );
  }

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
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
              <Badge variant="outline" className="text-[11px] font-medium text-muted-foreground">
                {app.category}
              </Badge>
            ) : null}
            <Badge variant="outline" className="text-[11px] font-medium text-muted-foreground">
              {getAppTypeLabel(app.type)}
            </Badge>
          </div>
          <h3 className="mt-2 line-clamp-1 text-[15px] font-semibold tracking-tight text-foreground">
            {app.name}
          </h3>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 min-h-[40px] text-[13px] leading-6 text-muted-foreground">
        {app.tagline || app.description || '应用详情暂未补充。'}
      </p>

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            起始价格
          </p>
          <p className="mt-1 text-[17px] leading-none font-semibold text-foreground tabular-nums">
            {priceLabel}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {activeOffers.length > 0 ? `${activeOffers.length} 个方案` : '即将开放'}
        </span>
      </div>
    </div>
  );
}

export function AppCard({ app, href, footer, className }: AppCardProps) {
  const rootClassName = cn(
    'group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/20',
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
      {footer ? <div className="border-t border-border px-6 py-5">{footer}</div> : null}
    </article>
  );
}
