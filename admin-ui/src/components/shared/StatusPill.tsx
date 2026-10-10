import { cn } from '@/lib/utils';

type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info';

interface StatusPillProps {
  tone: Tone;
  label: string;
  className?: string;
  /** Hide the leading dot for ultra-compact rows. */
  noDot?: boolean;
}

/**
 * Linear/Vercel-style 状态徽章：低饱和、无描边、小字号；支持 dark mode。
 * 浅色：高级别 50 (近灰) 背景 + 700 文本；深色：透明色块 + 400 文本，确保对比。
 */
const toneStyles: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  warn: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  danger: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  neutral: 'bg-muted text-muted-foreground',
};

const dotStyles: Record<Tone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  neutral: 'bg-muted-foreground/50',
};

export function StatusPill({ tone, label, className, noDot }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] leading-none font-medium',
        toneStyles[tone],
        className,
      )}
    >
      {!noDot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotStyles[tone])} />}
      {label}
    </span>
  );
}

export { statusToTone } from '@/lib/status-tone';
