import { useEffect, useState } from 'react';

import type { TocItem } from '@/lib/markdown';
import { cn } from '@/lib/utils';

interface ArticleTocProps {
  items: TocItem[];
  /** 用来构建 anchor href 的当前路径（含 query 与 hash 前缀） */
  pathname?: string;
  className?: string;
}

/**
 * 文章 / 文档侧边目录。基于 IntersectionObserver 监听标题元素进入视口，
 * 自动高亮当前章节；没有任何标题命中时不渲染。
 */
export function ArticleToc({ items, pathname = '', className }: ArticleTocProps) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '');

  useEffect(() => {
    if (typeof window === 'undefined' || items.length === 0) {
      return;
    }

    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (elements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top,
          );

        if (visible[0]?.target instanceof HTMLElement && visible[0].target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: [0, 1] },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="文章目录" className={cn('text-sm', className)}>
      <p className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.16em]">
        目录
      </p>
      <ul className="mt-3 space-y-1.5">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`${pathname}#${item.id}`}
                className={cn(
                  'block border-l-2 py-1 pl-3 text-[13px] leading-5 transition-colors',
                  isActive
                    ? 'border-primary text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground border-transparent',
                )}
                style={{ paddingLeft: `${12 + (item.level - 2) * 12}px` }}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
