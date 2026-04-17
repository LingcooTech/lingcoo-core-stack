import { ExternalLink, Menu, Search } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { adminSectionMeta, type AdminSectionKey } from '@/lib/foundation';
import { cn } from '@/lib/utils';

interface TopbarProps {
  onToggleSidebar: () => void;
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const location = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);

  const currentSection = Object.entries(adminSectionMeta).find(
    ([, meta]) => meta.href === location.pathname || location.pathname.startsWith(meta.href + '/')
  )?.[0] as AdminSectionKey | undefined;

  const section = currentSection ? adminSectionMeta[currentSection] : null;

  return (
    <>
      <header className="flex items-center justify-between gap-4 min-h-[64px] px-5 border-b border-border bg-white flex-shrink-0">
        {/* Left */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button
            variant="outline"
            size="icon"
            className="flex-shrink-0 h-9 w-9 rounded-md"
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
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider">
              <kbd className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded border border-border bg-white text-[10px] font-mono">/</kbd>
            </span>
          </button>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {section?.heroActions.map((action) => (
            <a
              key={action.href}
              href={action.href}
              target={action.external ? '_blank' : undefined}
              rel={action.external ? 'noreferrer' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-xs font-bold no-underline transition-colors',
                action.tone === 'primary'
                  ? 'bg-gradient-to-br from-primary to-blue-600 border-transparent text-white'
                  : 'bg-white border-border text-foreground hover:bg-muted'
              )}
            >
              <span>{action.label}</span>
              {action.external && <ExternalLink className="w-3 h-3" />}
              {action.shortcut && (
                <span className="inline-flex items-center justify-center h-4 px-1 rounded border border-current/20 bg-current/10 text-[9px] font-mono">
                  {action.shortcut}
                </span>
              )}
            </a>
          ))}

          <a
            href="/"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-white text-xs font-bold text-foreground no-underline hover:bg-muted transition-colors"
          >
            <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-muted text-[9px] font-semibold">ST</span>
            <span>状态</span>
          </a>
        </div>
      </header>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}
