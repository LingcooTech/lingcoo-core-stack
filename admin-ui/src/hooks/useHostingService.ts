import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
export function useHostingService(deploymentId: string, admin: boolean) {
  const query = useQuery({
    queryKey: ['hosting-service', admin, deploymentId],
    queryFn: async () =>
      admin
        ? apiClient(
            'GET /v1/admin/deployments/:deploymentId/hosting-service',
            `/v1/admin/deployments/${deploymentId}/hosting-service`,
          )
        : {
            ...(await apiClient(
              'GET /v1/deployments/:deploymentId/hosting-service',
              `/v1/deployments/${deploymentId}/hosting-service`,
            )),
            changes: [],
          },
    refetchInterval: 60_000,
  });
  return query;
}
