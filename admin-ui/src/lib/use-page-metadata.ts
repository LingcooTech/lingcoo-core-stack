import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPublicSiteSettings } from '@/api/settings';
import { getSiteDisplayName, PUBLIC_SITE_SETTINGS_QUERY_KEY } from '@/lib/site-settings';

/** Route-owned metadata; cleanup prevents customer content leaking into another route. */
export function usePageMetadata(
  title: string,
  description = '浏览行业应用、购买授权，并管理部署与服务。',
) {
  const { data } = useQuery({
    queryKey: PUBLIC_SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
    staleTime: 300_000,
  });
  const siteName = getSiteDisplayName(data);
  useEffect(() => {
    document.title = `${title} · ${siteName}`;
    const meta = document.createElement('meta');
    meta.name = 'description';
    meta.content = description.slice(0, 180);
    document.head.append(meta);
    return () => {
      meta.remove();
      document.title = siteName;
    };
  }, [title, description, siteName]);
}
