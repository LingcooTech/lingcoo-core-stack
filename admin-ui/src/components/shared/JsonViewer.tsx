import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface JsonViewerProps {
  data: unknown;
  label?: string;
  defaultExpanded?: boolean;
  className?: string;
}

export function JsonViewer({ data, label = 'Payload', defaultExpanded = false, className }: JsonViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const json = JSON.stringify(data, null, 2);

  if (!data || json === 'null' || json === '{}' || json === '[]') {
    return <span className="text-xs text-muted-foreground italic">空</span>;
  }

  return (
    <div className={cn('text-xs', className)}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors font-mono"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="font-bold">{label}</span>
      </button>
      {expanded && (
        <pre className="mt-1.5 p-2 rounded-lg bg-slate-50 border border-border text-[11px] font-mono leading-relaxed overflow-auto max-h-48 whitespace-pre-wrap break-all">
          {json}
        </pre>
      )}
    </div>
  );
}
