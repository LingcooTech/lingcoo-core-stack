import type { ExternalLink } from 'lucide-react';
import type { ComponentProps } from 'react';
import { adminSectionMeta, type AdminSectionKey } from '@/lib/foundation';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  sectionKey: AdminSectionKey;
  className?: string;
  /** 是否显示副文（lead）。Topbar 已承担页面标题，此处可补充上下文文案。 */
  showLead?: boolean;
}

/**
 * Topbar 承担了页面标题（breadcrumb + title），SectionHeader 默认返回 null。
 * 需要展示副文/说明时可传 showLead，会渲染一条轻量副文行。
 */
export function SectionHeader({ sectionKey, className, showLead = false }: SectionHeaderProps) {
  const section = adminSectionMeta[sectionKey];

  if (!showLead) return null;

  return (
    <div className={cn('border-border border-b px-6 py-3', className)}>
      <p className="text-muted-foreground text-[13px] leading-relaxed">{section.lead}</p>
    </div>
  );
}

export type { ComponentProps as ExternalLinkProps, ExternalLink };
