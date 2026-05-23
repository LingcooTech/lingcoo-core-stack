import { useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { RouteSlot } from './RouteSlot';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div
      className={cn(
        'grid min-h-screen w-full grid-cols-1',
        collapsed ? 'lg:grid-cols-[72px_minmax(0,1fr)]' : 'lg:grid-cols-[240px_minmax(0,1fr)]',
      )}
    >
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-[260px] border-r-0 p-0 lg:hidden"
          aria-describedby={undefined}
        >
          <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="bg-background flex min-h-screen flex-col overflow-hidden">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto">
          <RouteSlot />
        </main>
      </div>
    </div>
  );
}
