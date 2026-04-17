import type { ExternalLink } from 'lucide-react';
import type { ComponentProps } from 'react';
import { adminSectionMeta, type AdminSectionKey } from '@/lib/foundation';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  sectionKey: AdminSectionKey;
  className?: string;
}

export function SectionHeader({ sectionKey, className }: SectionHeaderProps) {
  const section = adminSectionMeta[sectionKey];

  return (
    <div className={cn('px-6 py-5 border-b border-border', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-foreground tracking-tight">{section.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl leading-relaxed">{section.lead}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {section.contextCards.map((card) => (
            <div key={card.label} className="hidden md:flex flex-col gap-0.5 rounded-md bg-muted/60 border border-border px-3 py-2 min-w-[120px]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</span>
              <span className="text-xs font-semibold text-foreground">{card.value}</span>
              <span className="text-[10px] text-muted-foreground leading-snug">{card.note}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export type { ComponentProps as ExternalLinkProps, ExternalLink };
