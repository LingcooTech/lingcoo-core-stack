import { ArrowRight, Clock } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { adminCommandItems } from '@/lib/foundation';
import { resolveIcon } from '@/lib/section-icons';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CommandItemModel = (typeof adminCommandItems)[number];

const RECENT_STORAGE_KEY = 'fd:command-palette:recent';
const RECENT_LIMIT = 5;

function readRecentIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function pushRecentId(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const prev = readRecentIds().filter((v) => v !== id);
    const next = [id, ...prev].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) setRecentIds(readRecentIds());
  }, [open]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        onOpenChange(true);
      }
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [onOpenChange]);

  const itemById = useMemo(() => new Map(adminCommandItems.map((item) => [item.id, item])), []);

  const recentItems = useMemo(
    () =>
      recentIds
        .map((id) => itemById.get(id))
        .filter((item): item is CommandItemModel => Boolean(item)),
    [recentIds, itemById],
  );

  const grouped = useMemo(() => {
    return adminCommandItems.reduce<Record<string, CommandItemModel[]>>((acc, item) => {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
      return acc;
    }, {});
  }, []);

  const handleSelect = useCallback(
    (item: CommandItemModel) => {
      onOpenChange(false);
      pushRecentId(item.id);
      if (item.external) {
        window.open(item.href, '_blank', 'noopener,noreferrer');
      } else {
        navigate(item.href);
      }
    },
    [navigate, onOpenChange],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="搜索页面、资源、操作..." />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>未找到相关结果</CommandEmpty>

        {recentItems.length > 0 && (
          <>
            <CommandGroup heading="最近访问">
              {recentItems.map((item) => (
                <PaletteItem key={`recent:${item.id}`} item={item} onSelect={handleSelect} recent />
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {Object.entries(grouped).map(([groupLabel, items], idx, arr) => (
          <div key={groupLabel}>
            <CommandGroup heading={groupLabel}>
              {items.map((item) => (
                <PaletteItem key={item.id} item={item} onSelect={handleSelect} />
              ))}
            </CommandGroup>
            {idx < arr.length - 1 && <CommandSeparator />}
          </div>
        ))}
      </CommandList>

      <div className="border-border text-muted-foreground flex items-center justify-between gap-3 border-t px-3 py-2 text-[11px]">
        <div className="flex items-center gap-3">
          <KeyHint label="移动" keys={['↑', '↓']} />
          <KeyHint label="打开" keys={['↵']} />
          <KeyHint label="关闭" keys={['Esc']} />
        </div>
        <span className="hidden sm:inline">⌘K / / 唤起</span>
      </div>
    </CommandDialog>
  );
}

function PaletteItem({
  item,
  onSelect,
  recent,
}: {
  item: CommandItemModel;
  onSelect: (item: CommandItemModel) => void;
  recent?: boolean;
}) {
  const Icon = resolveIcon(item.icon);
  return (
    <CommandItem
      value={[item.label, item.note, ...item.keywords].join(' ')}
      onSelect={() => onSelect(item)}
      className="flex items-center gap-3"
    >
      <span className="border-border bg-muted text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-md border">
        {recent ? (
          <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
        ) : (
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground block text-[13px] font-medium leading-tight">
          {item.label}
        </span>
        {item.note && (
          <span className="text-muted-foreground mt-0.5 block truncate text-[11px] leading-tight">
            {item.note}
          </span>
        )}
      </span>
      <ArrowRight className="text-muted-foreground/40 h-3.5 w-3.5 shrink-0" />
    </CommandItem>
  );
}

function KeyHint({ label, keys }: { label: string; keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k) => (
        <kbd
          key={k}
          className="border-border bg-card text-muted-foreground inline-flex h-4 min-w-[16px] items-center justify-center rounded border px-1 font-mono text-[10px]"
        >
          {k}
        </kbd>
      ))}
      <span>{label}</span>
    </span>
  );
}
