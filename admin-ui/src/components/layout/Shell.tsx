import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function Shell() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="grid min-h-screen w-full"
      style={{
        gridTemplateColumns: collapsed ? '84px minmax(0,1fr)' : '268px minmax(0,1fr)'
      }}
    >
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex flex-col min-h-screen bg-white overflow-hidden">
        <Topbar onToggleSidebar={() => setCollapsed((c) => !c)} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
