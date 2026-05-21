import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface JsonViewerProps {
  data: unknown;
  label?: string;
  defaultExpanded?: boolean;
  className?: string;
}

export function JsonViewer({
  data,
  label = 'Payload',
  defaultExpanded = false,
  className,
}: JsonViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const json = JSON.stringify(data, null, 2);

  if (!data || json === 'null' || json === '{}' || json === '[]') {
    return <span className="text-muted-foreground text-xs italic">空</span>;
  }

  return (
    <div className={cn('text-xs', className)}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-mono transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="font-bold">{label}</span>
      </button>
      {expanded && (
        <pre className="bg-muted border-border mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border p-2 font-mono text-[11px] leading-relaxed">
          {json}
        </pre>
      )}
    </div>
  );
}
