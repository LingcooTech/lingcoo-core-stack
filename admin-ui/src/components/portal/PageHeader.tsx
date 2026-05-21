import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { userSectionMeta, type UserSectionKey } from '@/lib/user-foundation';
import { cn } from '@/lib/utils';

export function PageHeader({
  sectionKey,
  className,
}: {
  sectionKey: UserSectionKey;
  className?: string;
}) {
  const section = userSectionMeta[sectionKey];

  return (
    <section
      className={cn('border-border/80 bg-card/90 rounded-lg border p-6 shadow-sm', className)}
    >
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
            {section.navTitle}
          </p>
          <h1 className="text-foreground mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {section.title}
          </h1>
          <p className="text-muted-foreground mt-3 max-w-3xl text-sm leading-7">{section.lead}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {section.heroActions.map((action) => (
            <Button
              key={action.href}
              variant={action.tone === 'primary' ? 'default' : 'outline'}
              asChild
            >
              <Link to={action.href}>{action.label}</Link>
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:max-w-3xl">
        {section.contextCards.map((card) => (
          <div key={card.label} className="border-border bg-muted/80 rounded-lg border p-4">
            <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
              {card.label}
            </p>
            <p className="text-foreground mt-1 text-sm font-semibold">{card.value}</p>
            <p className="text-muted-foreground mt-1 text-xs leading-5">{card.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
