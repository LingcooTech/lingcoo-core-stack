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
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-foreground tracking-tight">{section.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl leading-relaxed">{section.lead}</p>
      </div>
    </div>
  );
}

export type { ComponentProps as ExternalLinkProps, ExternalLink };
