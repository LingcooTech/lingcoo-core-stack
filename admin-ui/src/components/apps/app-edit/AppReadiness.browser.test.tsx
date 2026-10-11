import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { AppReadiness } from './AppReadiness';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
test('publication report distinguishes saved configuration from online acceptance without activating the app', async () => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  mocks.api.mockResolvedValue({
    configurationReady: true,
    checks: [
      {
        code: 'registry_live',
        title: '镜像在线拉取与只读权限',
        status: 'unverified',
        detail: '在线验收尚未完成',
        blocking: false,
      },
    ],
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <AppReadiness appCode="fixture" />
        </QueryClientProvider>,
      ),
    );
    await expect.poll(() => host.textContent).toContain('配置检查 0/0');
    await act(async () => host.querySelector('button')!.click());
    await expect.poll(() => document.body.textContent).toContain('上线验收事项');
    await act(async () =>
      document.body
        .querySelector('.ant-collapse-header')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    expect(document.body.textContent).toContain('在线验收尚未完成');
    expect(document.body.textContent).toContain('检查已保存的售价、套餐权益和交付条件');
    expect(mocks.api.mock.calls.every((c) => String(c[0]).startsWith('GET'))).toBe(true);
    expect(host.querySelectorAll('button')).toHaveLength(1);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
