import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export function useHostingFulfillment(orderNo: string, admin: boolean) {
  return useQuery({
    queryKey: ['hosting-fulfillment', admin, orderNo],
    queryFn: () =>
      admin
        ? apiClient(
            'GET /v1/admin/billing/hosting-fulfillments/:orderNo',
            `/v1/admin/billing/hosting-fulfillments/${encodeURIComponent(orderNo)}`,
          )
        : apiClient(
            'GET /v1/billing/hosting-fulfillments/:orderNo',
            `/v1/billing/hosting-fulfillments/${encodeURIComponent(orderNo)}`,
          ),
    refetchInterval: 30000,
  });
}
