import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { AppImageBrowser } from './AppImageBrowser';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
test('image browser resolves a selected tag to an immutable digest, and query failure remains retryable', async () => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  let fail = true,
    resolves = 0;
  const image = 'registry.example/team/app@sha256:' + 'a'.repeat(64);
  mocks.api.mockImplementation(async (id: string, _path: string, options?: { body: string }) => {
    if (id === 'GET /v1/admin/app-connections') return { items: [] };
    if (id.endsWith('/tags')) {
      if (fail) throw Error('Registry unavailable');
      return { repository: 'registry.example/team/app', tags: ['1.0.0'], next: null };
    }
    if (id.endsWith('/resolve')) {
      resolves++;
      expect(JSON.parse(options!.body)).toEqual({ reference: '1.0.0' });
      return { repository: 'registry.example/team/app', image };
    }
    throw Error(id);
  });
  async function click(text: string) {
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (v) => v.textContent?.replace(/\s/g, '') === text.replace(/\s/g, ''),
    );
    expect(button).toBeTruthy();
    await act(async () => button!.click());
  }
  try {
    await act(async () =>
      root.render(
        <ConfigProvider theme={{ token: { motion: false } }}>
          <App>
            <QueryClientProvider client={client}>
              <AppImageBrowser
                code="sample_app"
                imageKey="web"
                repository="registry.example/team/app"
              />
            </QueryClientProvider>
          </App>
        </ConfigProvider>,
      ),
    );
    await click('查看仓库版本');
    await expect.poll(() => document.body.textContent).toContain('Registry unavailable');
    fail = false;
    await click('重试');
    await expect.poll(() => document.body.textContent).toContain('1.0.0');
    expect(resolves).toBe(0);
    const rowButton = document.querySelector<HTMLButtonElement>('.ant-table-row button')!;
    await act(async () => rowButton.click());
    await expect.poll(() => document.body.textContent).toContain(image);
    expect(resolves).toBe(1);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
