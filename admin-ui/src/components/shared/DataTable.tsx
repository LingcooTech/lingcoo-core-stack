import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  getRowKey?: (row: T) => string;
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <TableRow>
      {Array.from({ length: cols }).map((_, i) => (
        <TableCell key={i}>
          <div className="h-4 rounded bg-muted animate-pulse" style={{ width: `${60 + Math.random() * 30}%` }} />
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
  getRowKey
}: DataTableProps<T>) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((col) => (
            <TableHead key={col.key} className={col.className}>
              {col.header}
            </TableHead>
          ))}
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
                onRowClick && 'cursor-pointer',
                rowClassName ? rowClassName(row) : ''
              )}
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
