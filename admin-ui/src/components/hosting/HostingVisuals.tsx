import { Empty, Progress, Spin, Typography } from 'antd';
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
    <div>
      <Typography.Text>{label}</Typography.Text>
      <div>
        {value === null || total === null
          ? '待上报'
          : `${value.toFixed(unit === 'GiB' ? 1 : 0)} / ${total.toFixed(unit === 'GiB' ? 1 : 0)} ${unit}`}
      </div>
      <Progress
        percent={percent ?? 0}
        showInfo={false}
        status={percent !== null && percent >= 90 ? 'exception' : 'normal'}
      />
      {hint && <Typography.Text type="secondary">{hint}</Typography.Text>}
    </div>
  );
}
export function HostingEmpty({ title, description }: { title: string; description: string }) {
  return (
    <Empty
      description={
        <>
          <strong>{title}</strong>
          <p>{description}</p>
        </>
      }
    />
  );
}
export function HostingLoading() {
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <Spin description="正在读取运行数据…" />
    </div>
  );
}
