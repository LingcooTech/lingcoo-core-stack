import { useMemo, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type RowSelectionState,
} from '@tanstack/react-table';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
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
  /** 行选择：开启后会在最前面插入 checkbox 列 */
  enableRowSelection?: boolean;
  selectedRowIds?: ReadonlySet<string>;
  onSelectionChange?: (selected: Set<string>) => void;
  minTableWidth?: string;
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
  enableRowSelection,
  selectedRowIds,
  onSelectionChange,
  minTableWidth = '720px',
}: DataTableProps<T>) {
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

  // RowSelection: Set<string> ↔ Record<string, boolean>
  const rowSelection = useMemo<RowSelectionState>(() => {
    if (!selectedRowIds) return {};
    const next: RowSelectionState = {};
    for (const id of selectedRowIds) next[id] = true;
    return next;
  }, [selectedRowIds]);

  const table = useReactTable<T>({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableRowSelection: !!enableRowSelection,
    state: { rowSelection },
    onRowSelectionChange: onSelectionChange
      ? (updater) => {
          const next = typeof updater === 'function' ? updater(rowSelection) : updater;
          const ids = new Set<string>();
          for (const id in next) {
            if (next[id]) ids.add(id);
          }
          onSelectionChange(ids);
        }
      : undefined,
    getRowId: getRowId
      ? (row, index) => getRowId(row, index)
      : getRowKey
        ? (row) => getRowKey(row)
        : undefined,
  });

  const totalCols = columns.length + (enableRowSelection ? 1 : 0);

  return (
    <Table style={{ minWidth: minTableWidth }}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {enableRowSelection && (
            <TableHead className="w-10">
              <Checkbox
                aria-label="选择所有行"
                checked={
                  table.getIsAllRowsSelected()
                    ? true
                    : table.getIsSomeRowsSelected()
                      ? 'indeterminate'
                      : false
                }
                onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
              />
            </TableHead>
          )}
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
                        'inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-foreground',
                        isSorted && 'text-foreground',
                      )}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {isSorted && sortConfig && (
                        <span className="text-primary">
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
          Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={totalCols} />)
        ) : data.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={totalCols}
              className="py-12 text-center text-sm text-muted-foreground"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              data-state={row.getIsSelected() ? 'selected' : undefined}
              className={cn(
                'transition-colors',
                onRowClick && 'cursor-pointer hover:bg-muted/40',
                row.getIsSelected() &&
                  'bg-primary/[0.04] shadow-[inset_2px_0_0_hsl(var(--primary))]',
                rowClassName ? rowClassName(row.original) : '',
              )}
            >
              {enableRowSelection && (
                <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    aria-label="选择该行"
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                  />
                </TableCell>
              )}
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
