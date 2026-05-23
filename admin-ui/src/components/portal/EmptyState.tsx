import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <Icon className="text-muted-foreground/50 h-7 w-7" strokeWidth={1.5} />
      <div className="space-y-1.5">
        <p className="text-foreground text-[14px] font-semibold">{title}</p>
        <p className="text-muted-foreground mx-auto max-w-sm text-[13px] leading-6">
          {description}
        </p>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
