import { ExternalLink, Search } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { adminSectionMeta, resolveAdminSection } from '@/lib/foundation';
import { cn } from '@/lib/utils';

export function Topbar() {
  const location = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);

  const currentSection = resolveAdminSection(location.pathname);
  const section = currentSection ? adminSectionMeta[currentSection] : null;

  return (
    <>
      <header className="border-border sticky top-0 z-20 flex min-h-[64px] shrink-0 items-center justify-between gap-4 border-b bg-white/80 px-5 backdrop-blur-sm">
        {/* Left */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="text-muted-foreground hover:border-primary/30 flex h-10 w-full max-w-[440px] cursor-pointer items-center gap-3 rounded-full border border-gray-200 bg-white px-3.5 text-left text-sm shadow-sm transition-colors"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">搜索...</span>
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider">
              <kbd className="border-border inline-flex h-5 min-w-5 items-center justify-center rounded border bg-white px-1.5 font-mono text-[10px]">
                /
              </kbd>
            </span>
          </button>
        </div>

        {/* Right actions */}
        <div className="flex shrink-0 items-center gap-2">
          {section?.heroActions.map((action) => (
            <a
              key={action.href}
              href={action.href}
              target={action.external ? '_blank' : undefined}
              rel={action.external ? 'noreferrer' : undefined}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold no-underline transition-all',
                action.tone === 'primary'
                  ? 'from-primary border-transparent bg-gradient-to-br to-blue-600 text-white shadow-sm hover:shadow'
                  : 'border-border text-foreground hover:bg-muted bg-white shadow-sm',
              )}
            >
              <span>{action.label}</span>
              {action.external && <ExternalLink className="h-3 w-3" />}
              {action.shortcut && (
                <span className="border-current/20 bg-current/10 inline-flex h-4 items-center justify-center rounded border px-1 font-mono text-[9px]">
                  {action.shortcut}
                </span>
              )}
            </a>
          ))}

          <a
            href="/"
            className="border-border text-foreground hover:bg-muted inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-semibold no-underline shadow-sm transition-colors"
          >
            <span className="bg-muted inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-semibold">
              ST
            </span>
            <span>状态</span>
          </a>

          <ThemeToggle />
        </div>
      </header>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}
