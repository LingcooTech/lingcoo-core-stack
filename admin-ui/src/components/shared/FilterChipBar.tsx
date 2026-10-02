import { useState, type ReactNode } from 'react';
import { ChevronDown, Filter, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterChipConfig {
  id: string;
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  options: FilterOption[];
  /** 选项数 >= 7 时建议开启 */
  searchable?: boolean;
}

interface FilterChipBarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  chips?: FilterChipConfig[];
  onClearAll?: () => void;
  /** 右侧自定义 slot（如「列设置」「导出」按钮） */
  endSlot?: ReactNode;
  className?: string;
}

function FilterChip({ chip }: { chip: FilterChipConfig }) {
  const { id, label, values, onChange, options, searchable } = chip;
  const [query, setQuery] = useState('');

  const filteredOptions = searchable
    ? options.filter(
        (opt) =>
          opt.label.toLowerCase().includes(query.toLowerCase()) ||
          opt.value.toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  const selectedLabels = values
    .map((v) => options.find((opt) => opt.value === v)?.label)
    .filter(Boolean);
  const isActive = values.length > 0;

  const renderChipLabel = () => {
    if (!isActive) return label;
    if (values.length === 1) return `${label}：${selectedLabels[0]}`;
    return `${label}：${selectedLabels[0]} +${values.length - 1}`;
  };

  const toggle = (value: string) => {
    if (values.includes(value)) {
      onChange(values.filter((v) => v !== value));
    } else {
      onChange([...values, value]);
    }
  };

  return (
    <Popover onOpenChange={(open) => !open && setQuery('')}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-8 gap-1.5 rounded-full px-3 text-xs font-medium',
            isActive && 'border-primary/40 bg-primary/5 text-primary',
          )}
        >
          {!isActive && <Filter className="size-3" />}
          <span>{renderChipLabel()}</span>
          {isActive ? (
            <button
              type="button"
              aria-label={`清除 ${label} 筛选`}
              className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-primary/15"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
            >
              <X className="size-3" />
            </button>
          ) : (
            <ChevronDown className="size-3" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        {searchable && (
          <div className="border-b border-border px-2 py-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`搜索 ${label}…`}
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
        )}
        <div className="max-h-64 overflow-auto py-1">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              没有匹配的选项
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const checked = values.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  htmlFor={`${id}-${opt.value}`}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    id={`${id}-${opt.value}`}
                    checked={checked}
                    onCheckedChange={() => toggle(opt.value)}
                  />
                  <span className="flex-1">{opt.label}</span>
                </label>
              );
            })
          )}
        </div>
        {values.length > 0 && (
          <div className="border-t border-border px-2 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-center text-xs"
              onClick={() => onChange([])}
            >
              清除选中
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * 资源页统一筛选条。
 * - 左：搜索框（可选）
 * - 中：filter chips，点击展开 Popover 多选
 * - 右：清除全部 + 自定义 slot
 *
 * 状态完全 controlled：调用方持有 searchValue / chip.values，可直接接入
 * useTableState 实现 URL 同步。
 */
export function FilterChipBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = '搜索...',
  chips,
  onClearAll,
  endSlot,
  className,
}: FilterChipBarProps) {
  const hasActiveFilter = chips?.some((c) => c.values.length > 0) ?? false;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {onSearchChange && (
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 pl-9 text-sm"
          />
        </div>
      )}
      {chips?.map((chip) => (
        <FilterChip key={chip.id} chip={chip} />
      ))}
      {hasActiveFilter && onClearAll && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={onClearAll}
        >
          <X className="size-3" />
          清除全部
        </Button>
      )}
      {endSlot && <div className="ml-auto flex items-center gap-2">{endSlot}</div>}
    </div>
  );
}
