import { ChevronRight, ExternalLink, Menu, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { useAuth } from '@/lib/auth';
import { adminSectionMeta, resolveAdminSection } from '@/lib/foundation';
import { hasPermission, normalizeRole } from '@/lib/rbac';
import { cn } from '@/lib/utils';

interface TopbarProps {
  onMenuClick?: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const [commandOpen, setCommandOpen] = useState(false);

  const currentSection = resolveAdminSection(location.pathname);
  const section = currentSection ? adminSectionMeta[currentSection] : null;
  const currentRole = normalizeRole(user?.role);

  return (
    <>
      <header className="border-border bg-card/70 sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4 backdrop-blur-md">
        {/* Mobile hamburger + Breadcrumb */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {onMenuClick ? (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="打开侧边栏"
              className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
          ) : null}
          <nav aria-label="面包屑" className="flex min-w-0 items-center gap-1.5 text-[13px]">
            {section ? (
              <>
                <span className="text-muted-foreground/80 hidden sm:inline">
                  {section.groupLabel}
                </span>
                <ChevronRight className="text-muted-foreground/40 hidden h-3.5 w-3.5 sm:inline" />
                <span className="text-foreground truncate font-semibold">{section.title}</span>
              </>
            ) : (
              <span className="text-muted-foreground">FD Core Stack</span>
            )}
          </nav>
        </div>

        {/* Right actions */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Search / command palette trigger */}
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="text-muted-foreground border-border bg-muted/50 hover:bg-muted hover:text-foreground inline-flex h-8 w-10 items-center gap-2 rounded-md border px-2.5 text-[12px] transition-colors md:w-56 lg:w-64"
            title="搜索 / 跳转 (⌘K)"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="text-muted-foreground/80 hidden flex-1 text-left md:inline">
              搜索...
            </span>
            <kbd className="border-border bg-card text-muted-foreground/80 ml-1 hidden h-4 items-center rounded border px-1 font-mono text-[10px] md:inline-flex">
              ⌘K
            </kbd>
          </button>

          {/* Section primary action (if any) */}
          {section?.heroActions
            .filter((action) => action.tone === 'primary')
            .filter((action) => {
              if (!action.href.startsWith('/admin')) {
                return true;
              }
              const targetSection = resolveAdminSection(action.href);
              return targetSection
                ? hasPermission(currentRole, adminSectionMeta[targetSection].permission)
                : true;
            })
            .slice(0, 1)
            .map((action) => (
              <Link
                key={action.href}
                to={action.href}
                target={action.external ? '_blank' : undefined}
                rel={action.external ? 'noreferrer' : undefined}
                className={cn(
                  'bg-primary hover:bg-primary/90 inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium text-white shadow-sm transition-colors',
                )}
              >
                <span>{action.label}</span>
                {action.external && <ExternalLink className="h-3 w-3" />}
              </Link>
            ))}

          <ThemeToggle />
        </div>
      </header>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}
