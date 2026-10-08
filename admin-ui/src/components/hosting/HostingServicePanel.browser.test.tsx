import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { HostingServicePanel } from './HostingServicePanel';
const mocks = vi.hoisted(() => ({ api: vi.fn(), role: 'admin' }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role: mocks.role } }) }));
const deploymentId = '00000000-0000-4000-8000-000000000001';
const service = {
  id: '00000000-0000-4000-8000-000000000002',
  deploymentId,
  source: 'trial',
  interval: 'month',
  periods: 1,
  state: 'pending_delivery',
  anchorAt: null,
  expiresAt: null,
  graceEndsAt: null,
  graceDays: 7,
  retentionDays: 30,
  version: 1,
  updatedAt: '2026-10-08T00:00:00Z',
};

test('admin grant retries preserve request identity, then render independently from payment', async () => {
  mocks.role = 'admin';
  mocks.api.mockReset();
  let attempts = 0;
  mocks.api.mockImplementation(async (id: string) => {
    if (id.startsWith('POST')) {
      if (++attempts === 1) throw new Error('Temporary connection failure');
      return { service, changes: [] };
    }
    return { service: null, changes: [] };
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <HostingServicePanel deploymentId={deploymentId} admin />
        </QueryClientProvider>,
      ),
    );
    expect(mocks.api).not.toHaveBeenCalled();
    await act(async () => host.querySelector('summary')!.click());
    await vi.waitFor(() => expect(host.textContent).toContain('尚未登记'));
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((b) => b.textContent === '登记托管服务期')!
        .click(),
    );
    const input = (name: string, value: string) => {
      const el = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name=${name}]`)!;
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    await act(async () => {
      input('graceDays', '7');
      input('retentionDays', '30');
      input('reason', 'Approved private trial grant');
      host.querySelector('form')!.requestSubmit();
    });
    await vi.waitFor(() => expect(host.textContent).toContain('Temporary connection failure'));
    await act(async () => host.querySelector('form')!.requestSubmit());
    await vi.waitFor(() => expect(host.textContent).toContain('等待交付起算'));
    expect(host.textContent).toContain('本页登记不产生付款记录');
    const calls = mocks.api.mock.calls.filter((c) => String(c[0]).startsWith('POST'));
    expect(calls).toHaveLength(2);
    expect(calls[0]![2].body).toBe(calls[1]![2].body);
    const payload = JSON.parse(calls[0]![2].body);
    expect(payload.expectedVersion).toBe(0);
    expect(payload.source).toBe('trial');
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});

test('customer uses owned read endpoint and never sees administrative grant controls', async () => {
  mocks.role = 'user';
  mocks.api.mockReset();
  mocks.api.mockResolvedValue({ service });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <HostingServicePanel deploymentId={deploymentId} />
        </QueryClientProvider>,
      ),
    );
    await act(async () => host.querySelector('summary')!.click());
    await vi.waitFor(() => expect(host.textContent).toContain('成功交付后起算'));
    expect(host.querySelector('form')).toBeNull();
    expect(host.textContent).not.toContain('人工延长服务期');
    expect(mocks.api.mock.calls[0]![1]).toBe(`/v1/deployments/${deploymentId}/hosting-service`);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
