import { cn } from '@/lib/utils';

type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info';

interface StatusPillProps {
  tone: Tone;
  label: string;
  className?: string;
}

/**
 * 使用 Phase B.1 的 semantic status token：
 *   bg-status-{tone}-bg / text-status-{tone}-fg / border-status-{tone}-border
 * 主题切换时只需在 :root / .dark 重映射这些 token，无需改组件。
 */
const toneStyles: Record<Tone, string> = {
  ok: 'bg-status-success-bg border-status-success-border text-status-success-fg',
  warn: 'bg-status-warning-bg border-status-warning-border text-status-warning-fg',
  danger: 'bg-status-danger-bg border-status-danger-border text-status-danger-fg',
  neutral: 'bg-status-neutral-bg border-status-neutral-border text-status-neutral-fg',
  info: 'bg-status-info-bg border-status-info-border text-status-info-fg',
};

const dotStyles: Record<Tone, string> = {
  ok: 'bg-status-success-fg',
  warn: 'bg-status-warning-fg',
  danger: 'bg-status-danger-fg',
  neutral: 'bg-status-neutral-fg',
  info: 'bg-status-info-fg',
};

export function StatusPill({ tone, label, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold',
        toneStyles[tone],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotStyles[tone])} />
      {label}
    </span>
  );
}

// Maps common status strings to tones
export function statusToTone(status: string): Tone {
  const s = status.toLowerCase();
  if (['active', 'paid', 'completed', 'ok', 'success', 'configured', 'granted'].includes(s))
    return 'ok';
  if (['pending', 'processing', 'partial'].includes(s)) return 'warn';
  if (['failed', 'cancelled', 'expired', 'revoked', 'inactive', 'error'].includes(s))
    return 'danger';
  if (['env', 'database'].includes(s)) return 'info';
  return 'neutral';
}
