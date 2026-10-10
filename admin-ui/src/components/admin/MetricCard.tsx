import { Card, Statistic, Typography } from 'antd';
import type { ReactNode } from 'react';

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="admin-metrics">{children}</div>;
}

export function MetricCard({
  title,
  value,
  note,
  icon,
  tone = 'blue',
}: {
  title: string;
  value: string | number;
  note?: ReactNode;
  icon?: ReactNode;
  tone?: 'blue' | 'green' | 'purple' | 'orange';
}) {
  return (
    <Card className="admin-metric">
      <div className="admin-metric__main">
        {icon && <span className={`admin-metric__icon admin-metric__icon--${tone}`}>{icon}</span>}
        <Statistic title={title} value={value} />
      </div>
      {note && (
        <Typography.Text type="secondary" className="admin-metric__note">
          {note}
        </Typography.Text>
      )}
    </Card>
  );
}
