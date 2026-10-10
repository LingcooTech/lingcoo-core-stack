import { Card, Table, Typography } from 'antd';
import type { OrderItem } from '@lingcoo/contracts';
import { formatAmount } from '@/lib/utils';

export function OrderItems({ items }: { items?: OrderItem[] }) {
  return (
    <Card title="购买明细" size="small">
      {!items?.length ? (
        <Typography.Text type="secondary">
          历史订单未记录购买快照，请以订单总金额及原始购买凭证为准。
        </Typography.Text>
      ) : (
        <Table<OrderItem>
          rowKey="kind"
          dataSource={items}
          pagination={false}
          size="small"
          scroll={{ x: 560 }}
          columns={[
            {
              title: '项目',
              render: (_, item) => (
                <>
                  <Typography.Text strong>{item.title}</Typography.Text>
                  {item.hostingTerms && (
                    <Typography.Paragraph
                      type="secondary"
                      style={{ marginTop: 8, marginBottom: 0 }}
                    >
                      {item.hostingTerms.description} ·{' '}
                      {item.hostingTerms.target?.kind === 'renewal'
                        ? '延长原服务期限'
                        : '首次交付后起算'}
                      ，不自动扣费；宽限 {item.hostingTerms.graceDays} 天，数据保留{' '}
                      {item.hostingTerms.retentionDays} 天
                    </Typography.Paragraph>
                  )}
                </>
              ),
            },
            {
              title: '类型',
              width: 100,
              render: (_, item) =>
                item.kind === 'software'
                  ? '软件授权'
                  : item.hostingTerms?.target?.kind === 'renewal'
                    ? '托管续费'
                    : '托管服务',
            },
            {
              title: '周期 / 数量',
              width: 120,
              render: (_, item) =>
                `${item.interval === 'one_time' ? '一次性' : item.interval === 'month' ? '自然月' : '自然年'} × ${item.quantity}`,
            },
            {
              title: '金额',
              width: 100,
              render: (_, item) => formatAmount(item.amount, item.currency),
            },
          ]}
        />
      )}
    </Card>
  );
}
