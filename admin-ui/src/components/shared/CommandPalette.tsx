import { useEffect } from 'react';
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

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Group command items by group label
const grouped = adminCommandItems.reduce<Record<string, typeof adminCommandItems>>((acc, item) => {
  if (!acc[item.group]) acc[item.group] = [];
  acc[item.group].push(item);
  return acc;
}, {});

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();

  // Keyboard shortcut: "/" and Cmd+K
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

  const handleSelect = (item: (typeof adminCommandItems)[0]) => {
    onOpenChange(false);
    if (item.external) {
      window.open(item.href, '_blank', 'noopener,noreferrer');
    } else {
      navigate(item.href);
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="搜索页面、资源、操作..." />
      <CommandList>
        <CommandEmpty>未找到相关结果</CommandEmpty>
        {Object.entries(grouped).map(([groupLabel, items], idx) => (
          <div key={groupLabel}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={groupLabel}>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.keywords.join(' ')}
                  onSelect={() => handleSelect(item)}
                  className="flex items-center gap-3"
                >
                  <span className="border-border bg-muted text-muted-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[9px] font-semibold">
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-bold">{item.label}</span>
                  {item.shortcut && (
                    <kbd className="bg-muted border-border shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                      {item.shortcut}
                    </kbd>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
