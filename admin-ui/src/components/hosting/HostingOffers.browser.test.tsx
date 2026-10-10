import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { HostingOffers } from './HostingOffers';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
test('catalog form keeps a failed create identity and converts yuan exactly to cents', async () => {
  mocks.api.mockReset();
  let attempts = 0;
  mocks.api.mockImplementation(async (id: string) => {
    if (id.startsWith('POST')) {
      if (++attempts === 1) throw new Error('Temporary failure');
      return {};
    }
    return {
      items: [],
      total: 0,
      apps: [{ id: '00000000-0000-4000-8000-000000000001', code: 'retail', name: 'Retail' }],
    };
  });
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const click = async (text: string) => {
    const el = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.replace(/\s/g, '') === text.replace(/\s/g, ''),
    );
    expect(el).toBeTruthy();
    await act(async () => el!.click());
  };
  const input = async (key: string, value: string) => {
    const el = document.getElementById('hosting-offer_' + key)!;
    await act(async () => {
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  try {
    await act(async () =>
      root.render(
        <ConfigProvider theme={{ token: { motion: false } }}>
          <App>
            <QueryClientProvider client={client}>
              <HostingOffers />
            </QueryClientProvider>
          </App>
        </ConfigProvider>,
      ),
    );
    await vi.waitFor(() => expect(host.textContent).toContain('尚无托管套餐'));
    await click('新增托管套餐');
    await act(async () =>
      document
        .querySelector<HTMLElement>('.ant-drawer [role=combobox]')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
    );
    await vi.waitFor(() =>
      expect(document.querySelector('.ant-select-item-option-content')).toBeTruthy(),
    );
    await act(async () =>
      document.querySelector<HTMLElement>('.ant-select-item-option-content')!.click(),
    );
    await input('code', 'monthly');
    await input('title', 'Retail hosting');
    await input('price', '19.90');
    await input('graceDays', '7');
    await input('retentionDays', '30');
    await input('description', 'Application hosting with backup');
    await input('reason', 'Prepare a test-only draft');
    await click('保存套餐');
    await vi.waitFor(() => expect(document.body.textContent).toContain('Temporary failure'));
    await click('保存套餐');
    await vi.waitFor(() => expect(document.querySelector('.ant-drawer form')).toBeNull());
    const calls = mocks.api.mock.calls.filter((c) => String(c[0]).startsWith('POST'));
    expect(calls).toHaveLength(2);
    expect(calls[0]![2].body).toBe(calls[1]![2].body);
    expect(JSON.parse(calls[0]![2].body)).toMatchObject({
      priceAmount: 1990,
      status: 'draft',
      currency: 'CNY',
    });
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
