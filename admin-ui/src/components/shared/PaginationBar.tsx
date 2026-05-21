import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface PaginationBarProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  itemLabel?: string;
}

export function PaginationBar({
  total,
  page,
  pageSize,
  onPageChange,
  isLoading = false,
  itemLabel = '条记录',
}: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(currentPage * pageSize, total);

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-muted-foreground text-xs">
        {total === 0 ? `暂无${itemLabel}` : `显示 ${start}-${end} / ${total} ${itemLabel}`}
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className="text-foreground text-xs font-bold">
          第 {currentPage} / {totalPages} 页
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isLoading || currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          上一页
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isLoading || currentPage >= totalPages || total === 0}
          onClick={() => onPageChange(currentPage + 1)}
        >
          下一页
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
