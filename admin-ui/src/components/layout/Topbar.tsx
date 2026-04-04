import { FileText, Menu, Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CommandPalette } from '@/components/shared/CommandPalette';

interface TopbarProps {
  onToggleSidebar: () => void;
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const [commandOpen, setCommandOpen] = useState(false);

  return (
    <>
      <header className="flex items-center justify-between gap-4 min-h-[64px] px-5 border-b border-border bg-white flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button
            variant="outline"
            size="icon"
            className="flex-shrink-0 h-9 w-9 rounded-xl"
            onClick={onToggleSidebar}
          >
            <Menu className="w-4 h-4" />
          </Button>

          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex items-center gap-3 h-10 w-full max-w-[440px] px-3.5 rounded-full border border-border bg-[#f8fafc] text-left text-sm text-muted-foreground hover:border-primary/30 transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1">搜索...</span>
            <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
              <kbd className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded border border-border bg-white text-[10px] font-mono">/</kbd>
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href="/docs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border bg-white text-xs font-bold text-foreground no-underline hover:bg-muted transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>API 文档</span>
          </a>
        </div>
      </header>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}
