import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { DocPageTreeNode } from '@/api/types';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface DocsSidebarProps {
  spaceTitle: string;
  spaceDescription?: string | null;
  spaceSlug: string;
  tree: DocPageTreeNode[];
  currentPath: string;
}

interface FlatNode extends DocPageTreeNode {
  depth: number;
}

function flatten(nodes: DocPageTreeNode[], depth = 0): FlatNode[] {
  const result: FlatNode[] = [];
  for (const node of nodes) {
    result.push({ ...node, depth });
    if (node.children.length > 0) {
      result.push(...flatten(node.children, depth + 1));
    }
  }
  return result;
}

function nodeMatches(node: FlatNode, query: string) {
  if (!query) return true;
  const haystack = `${node.title} ${node.summary ?? ''} ${node.path}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

/**
 * 文档侧边导航：空间标题 + 模糊过滤 + 多层缩进树。
 * 过滤会保留命中节点的父链上下文（先扁平化，过滤时回填祖先）。
 */
export function DocsSidebar({
  spaceTitle,
  spaceDescription,
  spaceSlug,
  tree,
  currentPath,
}: DocsSidebarProps) {
  const [query, setQuery] = useState('');
  const flat = useMemo(() => flatten(tree), [tree]);
  const visible = useMemo(() => {
    if (!query.trim()) return flat;
    const hitIds = new Set<string>();
    flat.forEach((node) => {
      if (nodeMatches(node, query)) {
        hitIds.add(node.id);
        // also surface ancestors so the tree context is preserved
        let parentId = node.parentId;
        while (parentId) {
          hitIds.add(parentId);
          parentId = flat.find((row) => row.id === parentId)?.parentId ?? null;
        }
      }
    });
    return flat.filter((node) => hitIds.has(node.id));
  }, [flat, query]);

  return (
    <aside className="border-border bg-card flex h-full flex-col overflow-hidden rounded-2xl border shadow-sm">
      <div className="border-border space-y-3 border-b p-4">
        <div>
          <p className="text-foreground text-[15px] font-semibold tracking-tight">{spaceTitle}</p>
          {spaceDescription ? (
            <p className="text-muted-foreground mt-1 line-clamp-2 text-[11px] leading-5">
              {spaceDescription}
            </p>
          ) : null}
        </div>
        <div className="relative">
          <Search className="text-muted-foreground/60 pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="过滤当前空间…"
            className="h-8 pl-8 text-[12px]"
          />
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="文档导航">
        {visible.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">没有匹配的文档</p>
        ) : (
          visible.map((node) => {
            const href = `/docs/${spaceSlug}/${node.path}`;
            const isActive = node.path === currentPath;
            return (
              <Link
                key={node.id}
                to={href}
                className={cn(
                  'block rounded-lg px-3 py-1.5 text-[13px] leading-5 transition-colors',
                  isActive
                    ? 'bg-foreground text-background font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                style={{ paddingLeft: `${12 + node.depth * 14}px` }}
              >
                {node.title}
              </Link>
            );
          })
        )}
      </nav>
    </aside>
  );
}
