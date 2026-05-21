import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BulkActionBarProps {
  /** 当前选中的行数；为 0 时组件不渲染 */
  selectedCount: number;
  /** 清除选中（取消选择按钮回调） */
  onClear: () => void;
  /** 自定义文案，默认「已选 N 项」 */
  label?: (count: number) => string;
  /** 操作按钮组（建议放 2-4 个） */
  children?: ReactNode;
  className?: string;
}

/**
 * 列表 bulk action 浮出条。
 * 位置：sticky top（紧贴 Topbar 下方），与表格列表共生。
 * 视觉：bg-foreground / text-background 反色，醒目但不喧宾夺主。
 * z-index：用 Phase B.1 的 z-overlay token。
 */
export function BulkActionBar({
  selectedCount,
  onClear,
  label = (n) => `已选 ${n} 项`,
  children,
  className,
}: BulkActionBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div
      role="region"
      aria-label="批量操作"
      className={cn(
        'z-overlay sticky top-0 flex items-center justify-between gap-3 rounded-lg',
        'bg-foreground text-background px-4 py-2.5 shadow-md',
        'animate-fadeIn',
        className,
      )}
    >
      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={onClear}
          aria-label="取消选择"
          className="hover:bg-background/10 inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors"
        >
          <X className="size-4" />
        </button>
        <span className="font-semibold">{label(selectedCount)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * 给 BulkActionBar 内部用的按钮变体；外层是深色背景，按钮要用反色或 outline。
 * 直接复用 Button + variant="secondary"/"ghost" 即可，这里仅作 named export
 * 提示该用什么 size。
 */
export const BulkActionButton = ({ className, ...props }: React.ComponentProps<typeof Button>) => (
  <Button size="sm" variant="secondary" className={cn('h-8', className)} {...props} />
);
