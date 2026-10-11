import { Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export function PortalUiProvider() {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="portal-ui">
        <Outlet />
      </div>
      <Toaster position="top-right" richColors />
    </TooltipProvider>
  );
}
