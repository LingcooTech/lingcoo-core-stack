import { Alert, Card, Descriptions, Typography } from 'antd';
import { useHostingFulfillment } from '@/components/hosting/useHostingFulfillment';
import { formatTime } from '@/lib/utils';

export function HostingFulfillmentStatus({ orderNo }: { orderNo: string }) {
  const result = useHostingFulfillment(orderNo, true);
  const item = result.data?.items[0];
  return (
    <Card title="托管履约" size="small" loading={result.isPending}>
      {result.isError ? (
        <Alert type="error" showIcon title="履约结果读取失败，请稍后刷新。" />
      ) : (
        <>
          <Typography.Paragraph>
            {item?.reason ?? '尚无履约记录，付款确认后更新。'}
          </Typography.Paragraph>
          {item?.status === 'review' && (
            <Alert
              type="warning"
              showIcon
              title="款项已记录，需平台处理；尚未发放服务或延长期限。"
            />
          )}
          {item?.after && (
            <Descriptions
              column={1}
              items={[
                {
                  key: 'expiresAt',
                  label: '本次履约后的到期日',
                  children: item.after.expiresAt
                    ? formatTime(item.after.expiresAt)
                    : '等待交付后起算',
                },
              ]}
            />
          )}
        </>
      )}
    </Card>
  );
}
