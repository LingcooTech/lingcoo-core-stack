import { useHostingFulfillment } from './useHostingFulfillment';
import { formatTime } from '@/lib/utils';
export function HostingFulfillmentStatus({
  orderNo,
  admin = false,
}: {
  orderNo: string;
  admin?: boolean;
}) {
  const result = useHostingFulfillment(orderNo, admin);
  if (result.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        履约结果读取失败，请稍后刷新。
      </p>
    );
  const item = result.data?.items[0];
  return (
    <div className="rounded-lg border p-3 text-sm">
      <p className="font-medium">托管履约</p>
      <p className="mt-1 text-muted-foreground">
        {result.isPending ? '正在读取…' : item ? item.reason : '尚无履约记录，付款确认后更新。'}
      </p>
      {item?.status === 'review' && (
        <p className="mt-1 text-destructive">款项已记录，需平台处理；尚未发放服务或延长期限。</p>
      )}
      {item?.after && (
        <p className="mt-1">
          本次履约后的到期日：
          {item.after.expiresAt ? formatTime(item.after.expiresAt) : '等待交付后起算'}
        </p>
      )}
    </div>
  );
}
