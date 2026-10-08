import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { ItemRefundLedger } from './ItemRefundLedger';
const mocks = vi.hoisted(() => ({ api: vi.fn(), role: 'admin' }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role: mocks.role } }) }));
const ledger = {
  orderNo: 'fixture',
  orderStatus: 'paid',
  legacyRefund: false,
  lines: [
    {
      kind: 'hosting',
      title: 'Monthly hosting',
      amount: 2000,
      refunded: 500,
      pending: 0,
      remaining: 1500,
    },
  ],
  records: [],
};
for (const admin of [true, false])
  test(
    admin
      ? 'finance review uses cents, fixed request id and hosting-only default'
      : 'customer sees refund totals without money mutation controls',
    async () => {
      Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
      mocks.role = admin ? 'admin' : 'user';
      mocks.api.mockReset();
      mocks.api.mockImplementation(async (id: string) =>
        id.startsWith('GET') ? ledger : new Promise(() => {}),
      );
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      try {
        await act(async () =>
          root.render(
            <QueryClientProvider client={client}>
              <ItemRefundLedger orderNo="fixture" admin={admin} />
            </QueryClientProvider>,
          ),
        );
        await act(async () => host.querySelector('summary')!.click());
        await expect.poll(() => host.textContent).toContain('Monthly hosting');
        expect(host.textContent).toContain('15.00');
        if (!admin) {
          expect(host.querySelector('input')).toBeNull();
          expect(host.textContent).not.toContain('核对退款申请');
          return;
        }
        const input = (label: string, value: string) => {
          const node = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
            node,
            value,
          );
          node.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const button = (text: string) =>
          Array.from(host.querySelectorAll('button')).find((b) => b.textContent === text)!;
        await act(async () => {
          input('退款金额（元）', '16');
          input('退款原因', '经客户确认的费用补偿');
        });
        expect(button('核对退款申请').disabled).toBe(true);
        await act(async () => input('退款金额（元）', '5.25'));
        await act(async () => button('核对退款申请').click());
        expect(mocks.api.mock.calls.filter((c) => String(c[0]).startsWith('POST'))).toHaveLength(0);
        expect(host.textContent).toContain('确认退还托管费用');
        await act(async () => button('确认发起退款').click());
        const posted = mocks.api.mock.calls.find((c) => String(c[0]).startsWith('POST'))!;
        expect(JSON.parse(posted[2].body)).toMatchObject({
          kind: 'hosting',
          amount: 525,
          reason: '经客户确认的费用补偿',
        });
        expect(JSON.parse(posted[2].body).requestId).toMatch(/^[a-f0-9-]{36}$/);
      } finally {
        await act(async () => root.unmount());
        client.clear();
        host.remove();
      }
    },
  );
