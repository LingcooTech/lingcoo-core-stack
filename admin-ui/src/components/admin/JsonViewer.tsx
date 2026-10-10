import { Collapse, Typography } from 'antd';
export function JsonViewer({
  data,
  label = 'Payload',
  defaultExpanded = false,
  className,
}: {
  data: unknown;
  label?: string;
  defaultExpanded?: boolean;
  className?: string;
}) {
  const json = JSON.stringify(data, null, 2);
  if (!data || ['null', '{}', '[]'].includes(json))
    return <Typography.Text type="secondary">空</Typography.Text>;
  return (
    <Collapse
      className={className}
      size="small"
      defaultActiveKey={defaultExpanded ? ['json'] : []}
      items={[{ key: 'json', label, children: <pre className="admin-json">{json}</pre> }]}
    />
  );
}
