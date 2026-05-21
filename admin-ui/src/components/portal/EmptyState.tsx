import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
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
    <Card className={cn('border-border bg-card/80 border-dashed', className)}>
      <CardContent className="flex flex-col items-center justify-center gap-4 p-10 text-center">
        <div className="bg-muted text-muted-foreground rounded-lg p-4">
          <Icon className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <p className="text-foreground text-lg font-semibold">{title}</p>
          <p className="text-muted-foreground max-w-xl text-sm leading-7">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
