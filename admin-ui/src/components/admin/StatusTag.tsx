import { Tag } from 'antd';
import type { StatusTone } from '@/lib/status-tone';
export { statusToTone } from '@/lib/status-tone';
const colors: Record<StatusTone, string> = {
  ok: 'success',
  warn: 'warning',
  danger: 'error',
  info: 'processing',
  neutral: 'default',
};
export function StatusTag({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  return (
    <Tag color={colors[tone]} className={className}>
      {label}
    </Tag>
  );
}
