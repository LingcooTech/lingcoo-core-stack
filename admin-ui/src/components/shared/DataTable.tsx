import { useMemo, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  /** 优先使用 getRowId；保留 getRowKey 作为旧 API 别名 */
  getRowId?: (row: T, idx: number) => string;
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

export function DataTable<T extends RowData>({
  columns,
  data,
  isLoading,
  emptyMessage = '暂无数据',
  onRowClick,
  rowClassName,
  getRowId,
  getRowKey,
  sortConfig,
  onSort,
}: DataTableProps<T>) {
  // 把现有 Column<T>[] 转换成 TanStack ColumnDef<T>[]。
  // 注意：排序仍由外部 sortConfig + onSort 控制（manualSorting），
  // TanStack 这里只承担 row model + flexRender 渲染。
  const tableColumns = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((col) => ({
        id: col.key,
        accessorFn: (row) =>
          col.sortKey ? (row as Record<string, unknown>)[col.sortKey as string] : undefined,
        header: col.header,
        cell: ({ row }) => col.cell(row.original),
        meta: { className: col.className, sortable: col.sortable, sortKey: col.sortKey },
        enableSorting: !!col.sortable,
      })),
    [columns],
  );

  const table = useReactTable<T>({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    getRowId: getRowId
      ? (row, index) => getRowId(row, index)
      : getRowKey
        ? (row) => getRowKey(row)
        : undefined,
  });

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {table.getHeaderGroups().map((headerGroup) =>
            headerGroup.headers.map((header) => {
              const col = columns.find((c) => c.key === header.column.id);
              if (!col) return null;
              const isSortable = col.sortable && onSort && col.sortKey;
              const isSorted = sortConfig && sortConfig.key === col.sortKey;

              return (
                <TableHead key={header.id} className={col.className}>
                  {isSortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.sortKey!)}
                      className={cn(
                        'inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-gray-900',
                        isSorted && 'text-gray-900',
                      )}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {isSorted && sortConfig && (
                        <span className="text-primary animate-fadeIn">
                          {sortConfig.direction === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </TableHead>
              );
            }),
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={columns.length} />)
        ) : data.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="text-muted-foreground py-12 text-center text-sm"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row, idx) => (
            <TableRow
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              className={cn(
                'animate-fadeIn transition-colors',
                onRowClick && 'cursor-pointer hover:bg-slate-50',
                rowClassName ? rowClassName(row.original) : '',
              )}
              style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
            >
              {row.getVisibleCells().map((cell) => {
                const col = columns.find((c) => c.key === cell.column.id);
                return (
                  <TableCell key={cell.id} className={col?.className}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                );
              })}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
