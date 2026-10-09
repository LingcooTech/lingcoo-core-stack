import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { HostingHandoverPanel } from './HostingHandoverPanel';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
const id = '00000000-0000-4000-8000-000000000001';
test('customer gets separate encrypted download and key actions; expired packages and operator cleanup are unavailable', async () => {
  mocks.api.mockReset();
  mocks.api.mockResolvedValue({
    items: [
      {
        id,
        state: 'ready',
        sha256: 'a'.repeat(64),
        size: 512,
        received: 512,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        createdAt: new Date().toISOString(),
      },
    ],
    reclamation: null,
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <HostingHandoverPanel
            deploymentId={id}
            version={4}
            completed
            admin={false}
            canManage={false}
          />
        </QueryClientProvider>,
      ),
    );
    await vi.waitFor(() => expect(host.textContent).toContain('领取下载授权'));
    expect(host.textContent).toContain('单独下载解密密钥');
    expect(host.textContent).not.toContain('确认回收本地资源');
    expect(host.textContent).not.toContain('制作加密交付包');
    mocks.api.mockResolvedValue({
      items: [{ id, state: 'ready', expiresAt: '2000-01-01T00:00:00Z', size: 512 }],
      reclamation: null,
    });
    await act(async () => {
      await client.invalidateQueries();
    });
    await vi.waitFor(() => expect(host.textContent).toContain('已过期'));
    expect(host.textContent).not.toContain('领取下载授权');
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
test('operator reclamation requires explicit instance identity and preserves request key after failure', async () => {
  mocks.api.mockReset();
  mocks.api.mockImplementation(async (endpoint: string) => {
    if (endpoint.startsWith('POST')) throw Error('Connection lost');
    return { items: [], reclamation: null };
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <HostingHandoverPanel deploymentId={id} version={4} completed admin canManage />
        </QueryClientProvider>,
      ),
    );
    await vi.waitFor(() => expect(host.textContent).toContain('确认回收本地资源'));
    const input = host.querySelector<HTMLInputElement>('[name=confirm]')!;
    expect(input.required).toBe(true);
    expect(input.pattern).toBe(id);
    await act(async () => {
      input.value = id;
      host.querySelector('form')!.requestSubmit();
    });
    await vi.waitFor(() => expect(host.textContent).toContain('Connection lost'));
    await act(async () => host.querySelector('form')!.requestSubmit());
    await vi.waitFor(() =>
      expect(mocks.api.mock.calls.filter((c) => c[0].startsWith('POST'))).toHaveLength(2),
    );
    const calls = mocks.api.mock.calls.filter((c) => c[0].startsWith('POST'));
    expect(calls[0]![2].body).toBe(calls[1]![2].body);
    expect(JSON.parse(calls[0]![2].body).confirmDeploymentId).toBe(id);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
