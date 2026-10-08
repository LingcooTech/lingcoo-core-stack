import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { test, expect, vi } from 'vitest';
import { AdminDeploymentsPage } from './AdminDeploymentsPage';
const mocks = vi.hoisted(() => ({ api: vi.fn(), role: 'support' }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role: mocks.role } }) }));
test('ledger deep links preserve mode and support cannot open hosting operations', async () => {
  mocks.api.mockResolvedValue({
    total: 1,
    limit: 20,
    offset: 0,
    items: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        label: 'Customer retail',
        userId: '00000000-0000-4000-8000-000000000002',
        customerEmail: 'customer@example.test',
        appCode: 'retail',
        appName: 'Retail',
        mode: 'managed',
        status: 'active',
        hostingState: 'ready',
        serverHost: null,
        nodeName: 'Node A',
        entitlementId: null,
        entitlementStatus: null,
        entitlementExpiresAt: null,
        domains: ['demo.app.example.test'],
        createdAt: '2026-10-08T00:00:00Z',
        lastDeployedAt: null,
        lastReportedAt: null,
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
        <MemoryRouter initialEntries={['/admin/deployments?mode=managed']}>
          <QueryClientProvider client={client}>
            <AdminDeploymentsPage />
          </QueryClientProvider>
        </MemoryRouter>,
      ),
    );
    await vi.waitFor(() => expect(host.textContent).toContain('Customer retail'));
    expect(mocks.api.mock.calls[0]?.[1]).toContain('mode=managed');
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((b) => b.textContent === '查看详情')!
        .click(),
    );
    const dialog = document.querySelector('[role=dialog]')!;
    expect(dialog.textContent).toContain('未关联');
    expect(
      Array.from(dialog.querySelectorAll('a'))
        .find((a) => a.textContent === '关联工单')
        ?.getAttribute('href'),
    ).toBe('/admin/tickets?deploymentId=00000000-0000-4000-8000-000000000001');
    expect(Array.from(dialog.querySelectorAll('a')).some((a) => a.textContent === '托管运维')).toBe(
      false,
    );
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
