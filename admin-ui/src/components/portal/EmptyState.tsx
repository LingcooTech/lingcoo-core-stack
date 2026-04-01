import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
  action
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <Card className={cn('border-dashed border-slate-300 bg-white/80', className)}>
      <CardContent className="flex flex-col items-center justify-center gap-4 p-10 text-center">
        <div className="rounded-3xl bg-slate-100 p-4 text-slate-600">
          <Icon className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <p className="text-lg font-black text-slate-950">{title}</p>
          <p className="max-w-xl text-sm leading-7 text-muted-foreground">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
