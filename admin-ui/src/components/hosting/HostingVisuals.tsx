import { Server, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
export function ResourceMeter({
  label,
  value,
  total,
  unit = 'MiB',
  hint,
}: {
  label: string;
  value: number | null;
  total: number | null;
  unit?: string;
  hint?: string;
}) {
  const percent =
    value !== null && total !== null && total > 0
      ? Math.min(100, Math.max(0, (value / total) * 100))
      : null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {value === null || total === null
            ? '待上报'
            : `${value.toFixed(unit === 'GiB' ? 1 : 0)} / ${total.toFixed(unit === 'GiB' ? 1 : 0)} ${unit}`}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={percent === null ? '待上报' : `${percent.toFixed(0)}%`}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all',
            percent !== null && percent >= 90 ? 'bg-amber-500' : 'bg-primary/70',
          )}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
export function HostingEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-14 text-center">
      <Server className="mb-4 size-7 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
export function HostingLoading() {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-xl border p-8 text-sm text-muted-foreground"
    >
      <LoaderCircle className="size-4 animate-spin" />
      正在读取运行数据…
    </div>
  );
}
