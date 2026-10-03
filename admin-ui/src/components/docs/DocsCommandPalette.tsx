import { runAsync } from '@/lib/async-events';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, FileText } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { getDocsSearchIndex } from '@/api/docs';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

interface DocsCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 文档站全局 Cmd+K 搜索面板。cmdk 自带模糊过滤，无需额外引入 fuse.js。
 * 全部已发布页一次性预取，5 分钟缓存。
 */
export function DocsCommandPalette({ open, onOpenChange }: DocsCommandPaletteProps) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['docs-search-index'],
    queryFn: getDocsSearchIndex,
    staleTime: 5 * 60_000,
  });

  const items = data?.items ?? [];

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    const key = item.spaceTitle;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="搜索文档页…（按 ESC 关闭）" />
      <CommandList>
        <CommandEmpty>没有匹配的页面</CommandEmpty>
        {Object.entries(grouped).map(([spaceTitle, pages]) => (
          <CommandGroup key={spaceTitle} heading={spaceTitle}>
            {pages.map((page) => (
              <CommandItem
                key={`${page.spaceSlug}/${page.pagePath}`}
                value={`${page.spaceTitle} ${page.pageTitle} ${page.summary ?? ''}`}
                onSelect={() => {
                  runAsync(() => navigate(`/docs/${page.spaceSlug}/${page.pagePath}`));
                  onOpenChange(false);
                }}
              >
                <FileText className="text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">{page.pageTitle}</span>
                  {page.summary ? (
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {page.summary}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{page.pagePath}</span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {items.length === 0 && (
          <CommandGroup heading="提示">
            <CommandItem disabled>
              <BookOpen className="text-muted-foreground" />
              当前还没有公开发布的文档页
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

interface SearchTriggerProps {
  onOpen: () => void;
}

/**
 * 顶栏右侧的搜索按钮，含 ⌘K 角标提示。
 */
export function DocsSearchTrigger({ onOpen }: SearchTriggerProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex h-9 w-[360px] items-center justify-between gap-2 rounded-full border border-border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground xl:w-[460px]"
      aria-label="搜索文档"
    >
      <span>搜索文档…</span>
      <kbd className="ml-1 inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
        ⌘ K
      </kbd>
    </button>
  );
}
