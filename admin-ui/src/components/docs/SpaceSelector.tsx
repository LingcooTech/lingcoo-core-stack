import { runAsync } from '@/lib/async-events';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { listPublicDocSpaces } from '@/api/docs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface SpaceSelectorProps {
  /** 当前选中空间 slug，hub 页可传空字符串 */
  currentSlug?: string;
}

/**
 * 文档站顶栏空间切换器，列出所有已发布文档空间，
 * 选中跳转到对应 space 首页。
 */
export function SpaceSelector({ currentSlug }: SpaceSelectorProps) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['public-doc-spaces'],
    queryFn: listPublicDocSpaces,
    staleTime: 5 * 60_000,
  });

  const spaces = data?.items ?? [];
  const currentSpace = spaces.find((space) => space.slug === currentSlug);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 max-w-[200px] items-center gap-2 rounded-full border border-border bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:border-foreground/30"
        >
          <span className="truncate">{currentSpace?.title || '所有文档空间'}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="w-72 rounded-xl border border-border bg-card p-2"
      >
        <DropdownMenuItem
          className={cn(
            'rounded-lg px-3 py-2.5 text-[13px]',
            !currentSlug && 'bg-accent text-accent-foreground',
          )}
          onSelect={(event) => {
            event.preventDefault();
            runAsync(() => navigate('/docs'));
          }}
        >
          <span className="flex-1">所有文档空间</span>
          {!currentSlug ? <Check className="h-3.5 w-3.5" /> : null}
        </DropdownMenuItem>
        {spaces.map((space) => {
          const isActive = space.slug === currentSlug;
          return (
            <DropdownMenuItem
              key={space.id}
              className={cn(
                'rounded-lg px-3 py-2.5 text-[13px]',
                isActive && 'bg-accent text-accent-foreground',
              )}
              onSelect={(event) => {
                event.preventDefault();
                runAsync(() => navigate(`/docs/${space.slug}`));
              }}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{space.title}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {space.pageCount} 页
                </span>
              </div>
              {isActive ? <Check className="h-3.5 w-3.5" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
