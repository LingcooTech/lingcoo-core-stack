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
        className="h-24 w-24 rounded-[22%] border border-gray-100 bg-white object-contain shadow-sm"
      />
    );
  }

  return (
    <div className="flex h-24 w-24 items-center justify-center rounded-[22%] bg-gray-50 text-2xl font-semibold text-gray-400 shadow-sm">
      {getInitials(app.name)}
    </div>
  );
}

function AppCardBody({ app }: { app: AppWithDetails }) {
  const activeOffers = getActiveOffers(app.checkoutOffers ?? []);
  const priceLabel = formatOfferStartingPriceLabel(activeOffers);

  return (
    <div className="relative overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-slate-100 via-sky-50/80 to-white" />

      <div className="relative flex flex-col items-center text-center">
        <div className="mb-5 flex justify-center">
          <AppIdentity app={app} />
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
          {app.category ? (
            <Badge className="bg-sky-50 text-sky-700 hover:bg-sky-50">{app.category}</Badge>
          ) : null}
          <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">
            {getAppTypeLabel(app.type)}
          </Badge>
        </div>

        <h3 className="mb-2 line-clamp-1 text-lg font-bold text-gray-900 transition-colors group-hover:text-blue-600">
          {app.name}
        </h3>

        <p className="mb-5 min-h-[44px] line-clamp-2 text-sm leading-6 text-gray-500">
          {app.tagline || app.description || '统一展示应用价值、方案和后续交付入口。'}
        </p>

        <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">
            {activeOffers.length > 0 ? `${activeOffers.length} 个方案` : '即将开放'}
          </span>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">起始价格</p>
          <p
            className={cn(
              'text-xl font-bold',
              priceLabel === '免费' ? 'text-green-600' : 'text-gray-900',
            )}
          >
            {priceLabel}
          </p>
          <p className="text-xs text-gray-400">
            {activeOffers.length > 1 ? '支持多个套餐选择' : activeOffers.length === 1 ? '当前仅有一个套餐' : '暂无上架中的售卖方案'}
          </p>
        </div>
      </div>
    </div>
  );
}

export function AppCard({ app, href, footer, className }: AppCardProps) {
  const rootClassName = cn(
    'group overflow-hidden rounded-xl border border-gray-200 bg-white transition-all duration-200 hover:border-gray-300 hover:shadow-md',
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
