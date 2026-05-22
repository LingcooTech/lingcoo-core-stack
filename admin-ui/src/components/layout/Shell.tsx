import { useState } from 'react';
import { RouteSlot } from './RouteSlot';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function Shell() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="grid min-h-screen w-full"
      style={{
        gridTemplateColumns: collapsed ? '72px minmax(0,1fr)' : '240px minmax(0,1fr)',
      }}
    >
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="bg-background flex min-h-screen flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto">
          <RouteSlot />
        </main>
      </div>
    </div>
  );
}
