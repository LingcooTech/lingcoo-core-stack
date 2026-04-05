import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listCatalogSnapshot } from '@/api/apps';

export function useCatalogData() {
  const { data: catalogData, isLoading } = useQuery({
    queryKey: ['catalog'],
    queryFn: listCatalogSnapshot
  });

  const allPlans = useMemo(
    () => (catalogData?.plans ?? []).map((plan) => ({ ...plan })),
    [catalogData?.plans]
  );

  return { allPlans, isLoading };
}
