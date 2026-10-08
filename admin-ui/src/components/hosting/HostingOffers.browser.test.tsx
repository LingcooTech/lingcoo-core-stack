import { act } from 'react';
import { createRoot } from 'react-dom/client';
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
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <HostingOffers />
        </QueryClientProvider>,
      ),
    );
    await vi.waitFor(() => expect(host.textContent).toContain('尚无托管套餐'));
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((b) => b.textContent === '新增托管套餐')!
        .click(),
    );
    const input = (name: string, value: string) => {
      const el = host.querySelector<HTMLInputElement>(`[name=${name}]`)!;
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    await act(async () => {
      input('appId', '00000000-0000-4000-8000-000000000001');
      input('code', 'monthly');
      input('title', 'Retail hosting');
      input('price', '19.90');
      input('graceDays', '7');
      input('retentionDays', '30');
      input('description', 'Application hosting with backup');
      input('reason', 'Prepare a test-only draft');
      host.querySelector('form')!.requestSubmit();
    });
    await vi.waitFor(() => expect(host.textContent).toContain('Temporary failure'));
    await act(async () => host.querySelector('form')!.requestSubmit());
    await vi.waitFor(() => expect(host.querySelector('form')).toBeNull());
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
