import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { HostingInstances } from './HostingInstances';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
test('restart confirmation creates a typed task and disables duplicate operations while pending', async () => {
  let pending = false;
  mocks.api.mockImplementation(async (id: string) => {
    if (id.startsWith('POST')) {
      pending = true;
      return { id: 'operation-id' };
    }
    return {
      instances: [
        {
          id: 'test-id',
          label: 'Retail fixture',
          appCode: 'retail',
          customerEmail: 'owner@example.test',
          nodeId: 'node-id',
          hostname: 'demo.app.lingcoo.com',
          state: 'ready',
          resources: { memoryMb: 1024 },
          services: [],
          backup: null,
          telemetryFresh: true,
        },
      ],
      operations: pending
        ? [
            {
              id: 'operation-id',
              deploymentId: 'test-id',
              kind: 'restart',
              state: 'pending',
              createdAt: '2026-10-08T00:00:00Z',
              result: null,
            },
          ]
        : [],
    };
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <HostingInstances />
        </QueryClientProvider>,
      ),
    );
    await vi.waitFor(() => expect(host.textContent).toContain('Retail fixture'));
    const button = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent === '重启应用',
    )!;
    await act(async () => button.click());
    expect(mocks.api.mock.calls.filter((c) => String(c[0]).startsWith('POST'))).toHaveLength(0);
    const dialog = document.querySelector('[role=dialog]')!;
    expect(dialog.textContent).toContain('数据库继续运行');
    await act(async () =>
      Array.from(dialog.querySelectorAll('button'))
        .find((b) => b.textContent === '确认执行')!
        .click(),
    );
    await vi.waitFor(() => expect(host.textContent).toContain('等待执行'));
    expect(button.disabled).toBe(true);
    const call = mocks.api.mock.calls.find((c) => String(c[0]).startsWith('POST'))!;
    expect(JSON.parse(call[2].body).kind).toBe('restart');
    expect(JSON.parse(call[2].body).requestKey).toMatch(/^[a-f0-9-]{36}$/);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
