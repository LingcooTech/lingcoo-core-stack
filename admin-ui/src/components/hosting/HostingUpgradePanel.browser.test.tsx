import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { HostingUpgradePanel } from './HostingUpgradePanel';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
const id = '00000000-0000-4000-8000-000000000001';
test('upgrade stays disabled without an approved release and clearly shows rollback history', async () => {
  mocks.api.mockReset();
  mocks.api.mockResolvedValue({
    currentImage: 'example@sha256:' + 'a'.repeat(64),
    releases: [],
    blockedReason: '暂无已审核升级版本',
    history: [
      {
        operationId: id,
        createdAt: '2026-10-09T00:00:00Z',
        plan: { label: 'Fixture release' },
        evidence: { outcome: 'rolled_back', backup: null },
      },
    ],
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <HostingUpgradePanel deploymentId={id} />
        </QueryClientProvider>,
      ),
    );
    expect(mocks.api).not.toHaveBeenCalled();
    await act(async () => host.querySelector('summary')!.click());
    await vi.waitFor(() => expect(host.textContent).toContain('暂无已审核升级版本'));
    expect(host.textContent).toContain('已回退旧版本');
    expect(host.textContent).toContain('无需数据库迁移');
    expect(host.querySelector('button')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
