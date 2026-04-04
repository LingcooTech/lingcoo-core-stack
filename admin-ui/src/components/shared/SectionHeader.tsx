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
    <div className={cn('border-b border-border px-6 py-4', className)}>
      <h1 className="text-lg font-black tracking-tight text-foreground">{section.title}</h1>
    </div>
  );
}

export type { ComponentProps as ExternalLinkProps, ExternalLink };
