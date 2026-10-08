import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
export function useHostingOverview() {
  return useQuery({
    queryKey: ['hosting-overview'],
    queryFn: () => apiClient('GET /v1/admin/hosting/overview', '/v1/admin/hosting/overview'),
    refetchInterval: 15000,
  });
}
