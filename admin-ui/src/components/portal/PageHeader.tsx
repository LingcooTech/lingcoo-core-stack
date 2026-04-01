import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { userSectionMeta, type UserSectionKey } from '@/lib/user-foundation';
import { cn } from '@/lib/utils';

export function PageHeader({ sectionKey, className }: { sectionKey: UserSectionKey; className?: string }) {
  const section = userSectionMeta[sectionKey];

  return (
    <section className={cn('rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-sm', className)}>
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">{section.navTitle}</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{section.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{section.lead}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {section.heroActions.map((action) => (
            <Button key={action.href} variant={action.tone === 'primary' ? 'default' : 'outline'} asChild>
              <Link to={action.href}>{action.label}</Link>
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:max-w-3xl">
        {section.contextCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">{card.label}</p>
            <p className="mt-1 text-sm font-black text-slate-900">{card.value}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
