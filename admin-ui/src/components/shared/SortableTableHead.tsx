import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { SortDirection } from '@/hooks/useTableSort';
import { cn } from '@/lib/utils';

interface SortableTableHeadProps {
  children: React.ReactNode;
  sortKey?: string;
  currentSortKey?: string | null;
  sortDirection?: SortDirection;
  onSort?: () => void;
  className?: string;
}

export function SortableTableHead({
  children,
  sortKey,
  currentSortKey,
  sortDirection,
  onSort,
  className,
}: SortableTableHeadProps) {
  const isSorted = sortKey && currentSortKey === sortKey;
  const canSort = Boolean(sortKey && onSort);

  if (!canSort) {
    return (
      <th
        className={cn(
          'px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase',
          className,
        )}
      >
        {children}
      </th>
    );
  }

  return (
    <th
      className={cn(
        'px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase',
        className,
      )}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'group inline-flex items-center gap-1.5 transition-colors hover:text-foreground',
          isSorted && 'text-foreground',
        )}
      >
        <span>{children}</span>
        <span className="relative flex h-4 w-4 items-center justify-center">
          {!isSorted && (
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          )}
          {isSorted && sortDirection === 'asc' && (
            <ArrowUp className="animate-fadeIn h-3.5 w-3.5 text-primary" />
          )}
          {isSorted && sortDirection === 'desc' && (
            <ArrowDown className="animate-fadeIn h-3.5 w-3.5 text-primary" />
          )}
        </span>
      </button>
    </th>
  );
}
