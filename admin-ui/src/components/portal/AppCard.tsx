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
        className="border-border bg-card h-20 w-20 rounded-[22%] border object-contain p-1 shadow-sm"
      />
    );
  }

  return (
    <div className="bg-muted text-muted-foreground flex h-20 w-20 items-center justify-center rounded-[22%] text-2xl font-semibold shadow-sm">
      {getInitials(app.name)}
    </div>
  );
}

function AppCardBody({ app }: { app: AppWithDetails }) {
  const activeOffers = getActiveOffers(app.checkoutOffers ?? []);
  const priceLabel = formatOfferStartingPriceLabel(activeOffers);

  return (
    <div className="relative overflow-hidden p-5">
      {app.coverUrl ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-cover bg-center opacity-[0.08]"
          style={{ backgroundImage: `url(${app.coverUrl})` }}
        />
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-slate-50 via-blue-50/50 to-white" />

      <div className="relative flex flex-col items-center text-center">
        <div className="mb-4 flex justify-center">
          <AppIdentity app={app} />
        </div>

        <div className="mb-2.5 flex flex-wrap items-center justify-center gap-2">
          {app.category ? (
            <Badge className="bg-sky-50 text-sky-700 hover:bg-sky-50">{app.category}</Badge>
          ) : null}
          <Badge className="bg-muted text-foreground hover:bg-muted">
            {getAppTypeLabel(app.type)}
          </Badge>
        </div>

        <h3 className="text-foreground mb-1.5 line-clamp-1 text-base font-semibold transition-colors duration-200 group-hover:text-blue-600">
          {app.name}
        </h3>

        <p className="text-muted-foreground mb-4 line-clamp-2 min-h-[40px] text-sm leading-6">
          {app.tagline || app.description || '应用详情暂未补充。'}
        </p>

        <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
          <span className="border-border bg-muted text-muted-foreground rounded-full border px-3 py-1 text-xs font-medium">
            {activeOffers.length > 0 ? `${activeOffers.length} 个方案` : '即将开放'}
          </span>
        </div>

        <div className="space-y-1">
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.08em]">
            起始价格
          </p>
          <p
            className={cn(
              'text-lg font-semibold',
              priceLabel === '免费' ? 'text-green-600' : 'text-foreground',
            )}
          >
            {priceLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

export function AppCard({ app, href, footer, className }: AppCardProps) {
  const rootClassName = cn(
    'border-border bg-card group overflow-hidden rounded-xl border shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-100/50',
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
