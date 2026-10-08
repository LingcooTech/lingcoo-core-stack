import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { HostingCheckout } from './HostingCheckout';
import { HostingFulfillmentStatus } from './HostingFulfillmentStatus';
const mocks = vi.hoisted(() => ({ api: vi.fn(), create: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
vi.mock('@/api/user', () => ({ createCheckoutSession: mocks.create }));
const offers = [
  {
    id: 'monthly',
    title: 'Monthly',
    version: 4,
    interval: 'month',
    priceAmount: 1990,
    currency: 'CNY',
    description: 'Managed hosting',
    graceDays: 7,
    retentionDays: 30,
  },
  {
    id: 'yearly',
    title: 'Yearly',
    version: 1,
    interval: 'year',
    priceAmount: 19900,
    currency: 'CNY',
    description: 'Annual managed hosting',
    graceDays: 7,
    retentionDays: 30,
  },
];
for (const renewal of [false, true])
  test(
    renewal
      ? 'renewal quotes match the existing service and target its deployment'
      : 'hosting-only checkout keeps the original software entitlement',
    async () => {
      Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
      mocks.api.mockImplementation(async (path: string) =>
        path.includes('hosting-service')
          ? { service: { source: 'paid', interval: 'month', graceDays: 7, retentionDays: 30 } }
          : { items: offers },
      );
      mocks.create.mockReset();
      mocks.create.mockImplementation(() => new Promise(() => {}));
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      try {
        await act(async () =>
          root.render(
            <QueryClientProvider client={client}>
              <HostingCheckout
                appCode="retail"
                planCode="owned"
                entitlementId="entitlement"
                deploymentId={renewal ? 'deployment' : undefined}
              />
            </QueryClientProvider>,
          ),
        );
        await act(async () => host.querySelector('summary')!.click());
        await expect
          .poll(() => host.querySelectorAll('select[aria-label="托管套餐"] option').length)
          .toBe(renewal ? 2 : 3);
        const select = host.querySelector<HTMLSelectElement>('select[aria-label="托管套餐"]')!;
        await act(async () => {
          select.value = 'monthly';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(host.textContent).toContain('19.90');
        expect(host.textContent).toContain('不自动扣费');
        const button = Array.from(host.querySelectorAll('button')).find(
          (b) => b.textContent === '创建托管订单',
        )!;
        await act(async () => button.click());
        expect(mocks.create).toHaveBeenCalledOnce();
        expect(mocks.create.mock.calls[0]![0]).toMatchObject({
          hosting: { offerId: 'monthly', version: 4 },
          hostingOnly: {
            entitlementId: 'entitlement',
            ...(renewal ? { deploymentId: 'deployment' } : {}),
          },
        });
        expect(mocks.create.mock.calls[0]![0]).not.toHaveProperty('amount');
      } finally {
        await act(async () => root.unmount());
        client.clear();
        host.remove();
      }
    },
  );
test('paid but unfulfilled hosting is visibly marked for platform review', async () => {
  mocks.api.mockResolvedValue({
    items: [{ status: 'review', reason: '付款后软件授权已失效，请联系平台处理', after: null }],
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <HostingFulfillmentStatus orderNo="test-order" />
        </QueryClientProvider>,
      ),
    );
    await expect.poll(() => host.textContent).toContain('需平台处理');
    expect(host.textContent).toContain('尚未发放服务或延长期限');
    expect(host.textContent).not.toContain('本次履约后的到期日');
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
