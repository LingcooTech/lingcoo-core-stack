import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { AppPurchaseDialog } from './AppPurchaseDialog';
const mocks = vi.hoisted(() => ({ create: vi.fn(), catalog: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ isEmailVerified: true }) }));
vi.mock('@/api/client', () => ({ apiClient: mocks.catalog }));
vi.mock('@/api/user', () => ({
  createCheckoutSession: mocks.create,
  getCheckoutSessionPublic: vi.fn(),
  getCheckoutSessionStatus: vi.fn(),
  reconcileCheckoutSession: vi.fn(),
}));
test('purchase confirms software plus hosting total and sends only offer identity and version', async () => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  mocks.catalog.mockResolvedValue({
    items: [
      {
        id: 'hosting',
        title: 'Monthly hosting',
        version: 3,
        interval: 'month',
        priceAmount: 1990,
        description: 'Managed application hosting',
        graceDays: 7,
        retentionDays: 30,
      },
    ],
  });
  mocks.create.mockImplementation(() => new Promise(() => {}));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const offer = {
    code: 'basic',
    planCode: 'basic',
    planId: 'plan',
    appId: 'app',
    appCode: 'retail',
    appName: 'Retail',
    title: 'Software',
    description: null,
    badge: null,
    interval: 'one_time',
    priceAmount: 10000,
    currency: 'CNY',
    status: 'active',
    isDefault: true,
    sortOrder: 0,
  };
  const button = (text: string) =>
    Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <AppPurchaseDialog
            appCode="retail"
            appName="Retail"
            open
            onOpenChange={() => {}}
            offers={[offer]}
            deliveryMode="one_click"
          />
        </QueryClientProvider>,
      ),
    );
    await expect.poll(() => document.querySelectorAll('#purchase-hosting option').length).toBe(2);
    const select = document.querySelector<HTMLSelectElement>('#purchase-hosting')!;
    await act(async () => {
      select.value = 'hosting';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(document.body.textContent).toContain('119.90');
    expect(document.body.textContent).toContain('宽限 7 天');
    await act(async () => button('下一步').click());
    expect(document.body.textContent).toContain('119.90');
    await act(async () => button('创建订单').click());
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({
      appCode: 'retail',
      hosting: { offerId: 'hosting', version: 3 },
    });
    expect(mocks.create.mock.calls[0]![0]).not.toHaveProperty('amount');
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
