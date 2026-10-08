import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { HostingNodeSchema } from '@lingcoo/contracts';
import { HostingNodeCard } from './HostingNodeCard';
vi.mock('@/api/client', () => ({ apiClient: vi.fn() }));
test('monitor-only server cannot allocate and expiry editing preserves China calendar date', async () => {
  const node = HostingNodeSchema.parse({
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Control server',
    serverIp: '192.0.2.1',
    enabled: false,
    healthy: true,
    capacity: { cpuMillis: 1000, memoryMb: 1024, diskMb: 10000 },
    reserved: { cpuMillis: 0, memoryMb: 0, diskMb: 0 },
    available: { cpuMillis: 1000, memoryMb: 2000, diskMb: 20000 },
    lastReportedAt: '2026-10-08T00:00:00Z',
    asset: { expiresAt: '2026-11-07T16:00:00Z' },
    telemetry: {
      dockerReady: true,
      canDeploy: false,
      available: { cpuMillis: 1000, memoryMb: 2000, diskMb: 20000 },
    },
    alerts: [],
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient();
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <HostingNodeCard node={node} />
        </QueryClientProvider>,
      ),
    );
    expect(
      Array.from(host.querySelectorAll('button')).find((b) => b.textContent === '启用分配')
        ?.disabled,
    ).toBe(true);
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((b) => b.textContent === '编辑资产与预算')!
        .click(),
    );
    expect(host.querySelector<HTMLInputElement>('input[type=date]')?.value).toBe('2026-11-08');
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
