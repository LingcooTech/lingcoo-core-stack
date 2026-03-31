import { cn } from '@/lib/utils';

type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info';

interface StatusPillProps {
  tone: Tone;
  label: string;
  className?: string;
}

const toneStyles: Record<Tone, string> = {
  ok: 'bg-green-50 border-green-200 text-green-700',
  warn: 'bg-amber-50 border-amber-200 text-amber-700',
  danger: 'bg-red-50 border-red-200 text-red-700',
  neutral: 'bg-slate-50 border-slate-200 text-slate-600',
  info: 'bg-blue-50 border-blue-200 text-blue-700'
};

export function StatusPill({ tone, label, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border',
        toneStyles[tone],
        className
      )}
    >
      <span
        className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', {
          'bg-green-500': tone === 'ok',
          'bg-amber-500': tone === 'warn',
          'bg-red-500': tone === 'danger',
          'bg-slate-400': tone === 'neutral',
          'bg-blue-500': tone === 'info'
        })}
      />
      {label}
    </span>
  );
}

// Maps common status strings to tones
export function statusToTone(status: string): Tone {
  const s = status.toLowerCase();
  if (['active', 'paid', 'completed', 'ok', 'success', 'configured', 'granted'].includes(s)) return 'ok';
  if (['pending', 'processing', 'partial'].includes(s)) return 'warn';
  if (['failed', 'cancelled', 'expired', 'revoked', 'inactive', 'error'].includes(s)) return 'danger';
  if (['env', 'database'].includes(s)) return 'info';
  return 'neutral';
}
