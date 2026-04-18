import { ExternalLink, Search } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { adminSectionMeta, resolveAdminSection } from '@/lib/foundation';
import { cn } from '@/lib/utils';

export function Topbar() {
  const location = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);

  const currentSection = resolveAdminSection(location.pathname);
  const section = currentSection ? adminSectionMeta[currentSection] : null;

  return (
    <>
      <header className="sticky top-0 z-20 flex min-h-[64px] items-center justify-between gap-4 border-b border-border bg-white/80 px-5 backdrop-blur-sm flex-shrink-0">
        {/* Left */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex items-center gap-3 h-10 w-full max-w-[440px] px-3.5 rounded-full border border-gray-200 bg-white text-left text-sm text-muted-foreground shadow-sm hover:border-primary/30 transition-colors cursor-pointer"
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
                'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-semibold no-underline transition-all',
                action.tone === 'primary'
                  ? 'bg-gradient-to-br from-primary to-blue-600 border-transparent text-white shadow-sm hover:shadow'
                  : 'bg-white border-border text-foreground hover:bg-muted shadow-sm'
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
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-white text-xs font-semibold text-foreground no-underline hover:bg-muted transition-colors shadow-sm"
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
