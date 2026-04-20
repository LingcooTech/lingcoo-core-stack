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
        className="h-20 w-20 rounded-[22%] border border-gray-100 bg-white object-contain p-1 shadow-sm"
      />
    );
  }

  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-[22%] bg-gray-50 text-2xl font-semibold text-gray-400 shadow-sm">
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
          <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">
            {getAppTypeLabel(app.type)}
          </Badge>
        </div>

        <h3 className="mb-1.5 line-clamp-1 text-base font-semibold text-gray-900 transition-colors duration-200 group-hover:text-blue-600">
          {app.name}
        </h3>

        <p className="mb-4 min-h-[40px] line-clamp-2 text-sm leading-6 text-gray-500">
          {app.tagline || app.description || '应用详情暂未补充。'}
        </p>

        <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">
            {activeOffers.length > 0 ? `${activeOffers.length} 个方案` : '即将开放'}
          </span>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">起始价格</p>
          <p
            className={cn(
              'text-lg font-semibold',
              priceLabel === '免费' ? 'text-green-600' : 'text-gray-900',
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
    'group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-100/50',
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
      {footer ? <div className="border-t border-gray-100 px-6 py-5">{footer}</div> : null}
    </article>
  );
}
