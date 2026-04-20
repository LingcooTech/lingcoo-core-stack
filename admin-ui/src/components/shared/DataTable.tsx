import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/shared/Skeleton';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  sortable?: boolean;
  sortKey?: keyof T;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  getRowKey?: (row: T) => string;
  sortConfig?: { key: keyof T | null; direction: 'asc' | 'desc' | null };
  onSort?: (key: keyof T) => void;
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <TableRow>
      {Array.from({ length: cols }).map((_, i) => (
        <TableCell key={i}>
          <Skeleton className="h-4" style={{ width: `${60 + Math.random() * 30}%` }} />
        </TableCell>
      ))}
    </TableRow>
  );
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyMessage = '暂无数据',
  onRowClick,
  rowClassName,
  getRowKey,
  sortConfig,
  onSort,
}: DataTableProps<T>) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((col) => {
            const isSortable = col.sortable && onSort && col.sortKey;
            const isSorted = sortConfig && sortConfig.key === col.sortKey;
            
            return (
              <TableHead key={col.key} className={col.className}>
                {isSortable ? (
                  <button
                    type="button"
                    onClick={() => onSort(col.sortKey!)}
                    className={cn(
                      'inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-gray-900',
                      isSorted && 'text-gray-900'
                    )}
                  >
                    {col.header}
                    {isSorted && sortConfig && (
                      <span className="text-primary animate-fadeIn">
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={columns.length} />)
        ) : data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="text-center py-12 text-muted-foreground text-sm">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          data.map((row, idx) => (
            <TableRow
              key={getRowKey ? getRowKey(row) : idx}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'animate-fadeIn transition-colors',
                onRowClick && 'cursor-pointer hover:bg-slate-50',
                rowClassName ? rowClassName(row) : ''
              )}
              style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
            >
              {columns.map((col) => (
                <TableCell key={col.key} className={col.className}>
                  {col.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
