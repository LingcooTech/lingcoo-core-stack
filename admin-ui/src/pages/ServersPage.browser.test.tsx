import { act } from 'react';
import { App, ConfigProvider } from 'antd';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { ServersPage } from './ServersPage';
vi.mock('@/api/client', () => ({ apiClient: vi.fn(async () => ({ items: [] })) }));
test('server resources have a standalone enrollment entry and no instance operations tabs', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <ConfigProvider theme={{ token: { motion: false } }}>
            <App>
              <MemoryRouter>
                <ServersPage />
              </MemoryRouter>
            </App>
          </ConfigProvider>
        </QueryClientProvider>,
      ),
    );
    await expect.poll(() => host.textContent).toContain('尚未添加服务器');
    expect(host.querySelector('a[href="/developers/server-onboarding"]')).not.toBeNull();
    expect(host.querySelector('[role=tablist]')).toBeNull();
    const add = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent === '添加服务器',
    );
    expect(add).toBeDefined();
    await act(async () => add!.click());
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('可分配内存');
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
