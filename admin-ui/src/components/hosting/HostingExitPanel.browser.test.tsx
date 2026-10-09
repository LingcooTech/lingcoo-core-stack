import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { HostingExitPanel } from './HostingExitPanel';
const mocks = vi.hoisted(() => ({ api: vi.fn(), role: 'admin' }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role: mocks.role } }) }));
const id = '00000000-0000-4000-8000-000000000001';
test('exit panel lazily loads and preserves request identity after transport failure', async () => {
  mocks.api.mockReset();
  mocks.role = 'admin';
  mocks.api.mockImplementation(async (endpoint: string) => {
    if (endpoint.startsWith('POST')) throw Error('Connection lost');
    return { exit: null, events: [] };
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <HostingExitPanel deploymentId={id} admin />
        </QueryClientProvider>,
      ),
    );
    expect(mocks.api).not.toHaveBeenCalled();
    await act(async () => host.querySelector('summary')!.click());
    await vi.waitFor(() => expect(host.textContent).toContain('尚未申请退出'));
    await act(async () => {
      const input = host.querySelector<HTMLInputElement>('[name=reason]')!;
      input.value = 'Approved customer retirement';
      host.querySelector('form')!.requestSubmit();
    });
    await vi.waitFor(() => expect(host.textContent).toContain('Connection lost'));
    await act(async () => host.querySelector('form')!.requestSubmit());
    await vi.waitFor(() =>
      expect(mocks.api.mock.calls.filter((c) => c[0].startsWith('POST'))).toHaveLength(2),
    );
    const calls = mocks.api.mock.calls.filter((c) => c[0].startsWith('POST'));
    expect(calls[0]![2].body).toBe(calls[1]![2].body);
    expect(host.textContent).toContain('不会自动删除数据或退款');
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
test('customer receives handover acknowledgement, with no operator stop control', async () => {
  mocks.api.mockReset();
  mocks.role = 'user';
  mocks.api.mockImplementation(async (endpoint: string) =>
    endpoint.endsWith('/handover')
      ? { items: [], reclamation: null }
      : {
          exit: {
            id,
            deploymentId: id,
            state: 'retained',
            version: 3,
            reason: 'Requested closure',
            retainUntil: '2026-11-09T00:00:00Z',
            handoverReference: 'Secure handover #100',
            evidence: { manifestSha256: 'a'.repeat(64) },
          },
          events: [],
        },
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <HostingExitPanel deploymentId={id} />
        </QueryClientProvider>,
      ),
    );
    await act(async () => host.querySelector('summary')!.click());
    await vi.waitFor(() => expect(host.textContent).toContain('Secure handover #100'));
    expect(host.textContent).toContain('确认收到数据');
    expect(host.textContent).not.toContain('确认停服并备份');
    expect(host.querySelector<HTMLInputElement>('input[type=checkbox]')!.required).toBe(true);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
