import { App as AntApp, ConfigProvider, theme } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import zhCN from 'antd/locale/zh_CN';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getPublicSiteSettings } from '@/api/settings';
import { PUBLIC_SITE_SETTINGS_QUERY_KEY } from '@/lib/site-settings';
import { useTheme } from '@/lib/theme';
import '@/styles/admin.css';

export function AdminUiProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const { data } = useQuery({
    queryKey: PUBLIC_SITE_SETTINGS_QUERY_KEY,
    queryFn: getPublicSiteSettings,
    staleTime: 5 * 60_000,
  });
  return (
    <StyleProvider layer>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: resolvedTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: data?.brandPrimaryColor || '#2563eb',
            colorInfo: data?.brandPrimaryColor || '#2563eb',
            borderRadius: 8,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          },
        }}
      >
        <AntApp className="stack-admin">{children}</AntApp>
      </ConfigProvider>
    </StyleProvider>
  );
}
