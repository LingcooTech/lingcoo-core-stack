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
        gridTemplateColumns: collapsed ? '84px minmax(0,1fr)' : '268px minmax(0,1fr)',
      }}
    >
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex min-h-screen flex-col overflow-hidden bg-[#f8fafc]">
        <Topbar />
        <main className="flex-1 overflow-auto">
          <RouteSlot />
        </main>
      </div>
    </div>
  );
}
