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
          'text-muted-foreground px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider',
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
        'text-muted-foreground px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider',
        className,
      )}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'hover:text-foreground group inline-flex items-center gap-1.5 transition-colors',
          isSorted && 'text-foreground',
        )}
      >
        <span>{children}</span>
        <span className="relative flex h-4 w-4 items-center justify-center">
          {!isSorted && (
            <ArrowUpDown className="text-muted-foreground h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
          )}
          {isSorted && sortDirection === 'asc' && (
            <ArrowUp className="text-primary animate-fadeIn h-3.5 w-3.5" />
          )}
          {isSorted && sortDirection === 'desc' && (
            <ArrowDown className="text-primary animate-fadeIn h-3.5 w-3.5" />
          )}
        </span>
      </button>
    </th>
  );
}
