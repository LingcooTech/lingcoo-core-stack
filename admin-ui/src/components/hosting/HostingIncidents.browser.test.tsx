import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { HostingIncidents } from './HostingIncidents';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
test('monitor UI distinguishes no scan, active failure and recovery history without mutation controls', async () => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  const data = { items: [], total: 0, activeCount: 0, limit: 30, offset: 0, lastScanAt: null };
  mocks.api.mockResolvedValue(data);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <HostingIncidents />
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    );
    await expect.poll(() => host.textContent).toContain('尚未完成首次扫描');
    const item = {
      id: 'incident',
      scope: 'deployment',
      resourceId: 'deployment',
      title: '本地备份缺失',
      severity: 'critical',
      state: 'active',
      occurrences: 2,
      firstDetectedAt: new Date().toISOString(),
      lastDetectedAt: new Date().toISOString(),
      resolvedAt: null,
      resolution: null,
    };
    mocks.api.mockImplementation(async (id: string) =>
      id.includes('/events')
        ? { items: [{ id: 'event', kind: 'recovered', observedAt: new Date().toISOString() }] }
        : {
            ...data,
            items: [item],
            total: 1,
            activeCount: 1,
            lastScanAt: new Date().toISOString(),
          },
    );
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['hosting-incidents'] });
    });
    await expect.poll(() => host.textContent).toContain('本地备份缺失');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.ant-table-row-expand-icon')!.click(),
    );
    await expect.poll(() => host.textContent).toContain('确认恢复');
    expect(host.querySelector('a')?.getAttribute('href')).toContain('deploymentId=deployment');
    expect(mocks.api.mock.calls.every((c) => String(c[0]).startsWith('GET'))).toBe(true);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
