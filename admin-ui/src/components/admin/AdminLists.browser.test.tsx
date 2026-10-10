import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App, ConfigProvider } from 'antd';
import { expect, test, vi } from 'vitest';
import { InstallsPage } from '@/pages/InstallsPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { UsersPage } from '@/pages/UsersPage';
import { AdminItemRefundLedger } from './ItemRefundLedger';
const mocks = vi.hoisted(() => ({
  listInstalls: vi.fn(),
  listOrders: vi.fn(),
  listUsers: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  activateUser: vi.fn(),
  suspendUser: vi.fn(),
  resetUserPassword: vi.fn(),
  reconcileOrder: vi.fn(),
  cancelOrder: vi.fn(),
  refundOrder: vi.fn(),
  getOrderDetail: vi.fn(),
  api: vi.fn(),
  role: 'support',
}));
vi.mock('@/api/admin', () => mocks);
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'staff', role: mocks.role } }) }));
const click = async (text: string) => {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.replace(/\s/g, '') === text,
  );
  expect(button, `button ${text}`).toBeTruthy();
  await act(async () => button!.click());
};
const input = async (label: string, value: string) => {
  const item = [...document.querySelectorAll<HTMLLabelElement>('label')].find(
    (node) => node.textContent?.replace(/\s/g, '') === label,
  );
  const node = document.getElementById(item!.htmlFor)!;
  await act(async () => {
    const prototype =
      node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
async function renderPage(children: ReactNode, verify: (host: HTMLElement) => Promise<void>) {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <QueryClientProvider client={client}>
            <ConfigProvider theme={{ token: { motion: false } }}>
              <App>{children}</App>
            </ConfigProvider>
          </QueryClientProvider>
        </MemoryRouter>,
      ),
    );
    await verify(host);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
}
test('installation loading failure stays visible and retry loads records instead of reporting empty', async () => {
  mocks.role = 'support';
  mocks.listInstalls.mockReset();
  mocks.listInstalls.mockRejectedValueOnce(new Error('fixture network failure')).mockResolvedValue({
    items: [
      {
        id: 'install',
        extensionInstallId: 'client-fixture',
        status: 'active',
        createdAt: '2026-10-10T00:00:00Z',
      },
    ],
    total: 1,
  });
  await renderPage(<InstallsPage />, async (host) => {
    await vi.waitFor(() => expect(host.textContent).toContain('fixture network failure'));
    expect(host.textContent).not.toContain('暂无客户端登记记录');
    await click('重试');
    await vi.waitFor(() => expect(host.textContent).toContain('client-fixture'));
    expect(mocks.listInstalls.mock.calls[0]?.[0]).toMatchObject({ limit: 20, offset: 0 });
  });
});
test('support can inspect orders without reconcile, cancellation or refund actions', async () => {
  mocks.role = 'support';
  const item = {
    id: 'id',
    orderNo: 'order-fixture',
    appId: 'retail',
    userId: 'customer',
    amount: 2500,
    currency: 'CNY',
    status: 'paid',
    createdAt: '2026-10-10T00:00:00Z',
    app: { name: 'Retail' },
  };
  mocks.listOrders.mockResolvedValue({ items: [item], total: 1 });
  mocks.getOrderDetail.mockResolvedValue({
    item,
    paymentAttempts: [],
    entitlements: [],
    events: [],
  });
  await renderPage(<OrdersPage />, async (host) => {
    await vi.waitFor(() => expect(host.textContent).toContain('order-fixture'));
    expect(host.querySelector('input[type=checkbox]')).toBeNull();
    expect(
      [...host.querySelectorAll('button')].find(
        (node) => node.textContent?.replace(/\s/g, '') === '同步',
      )?.disabled,
    ).toBe(true);
    await click('查看');
    await vi.waitFor(() =>
      expect(document.querySelector('[role=dialog]')?.textContent).toContain('Retail'),
    );
    const body = document.querySelector('[role=dialog]')!.textContent!;
    expect(body).not.toContain('同步订单');
    expect(body).not.toContain('关闭订单');
    expect(body).not.toContain('全额退款');
  });
});
test('editing an own account sends display name only, retains failed input and blocks accidental close', async () => {
  mocks.role = 'admin';
  mocks.listUsers.mockResolvedValue({
    items: [
      {
        id: 'staff',
        email: 'admin@example.test',
        role: 'admin',
        status: 'active',
        emailVerified: true,
        displayName: 'Before',
        createdAt: '2026-10-10T00:00:00Z',
      },
    ],
    total: 1,
  });
  mocks.updateUser.mockReset().mockRejectedValue(new Error('fixture save failure'));
  await renderPage(<UsersPage />, async (host) => {
    await vi.waitFor(() => expect(host.textContent).toContain('admin@example.test'));
    await click('编辑');
    await input('显示名称', 'After');
    await click('保存');
    await vi.waitFor(() =>
      expect(mocks.updateUser).toHaveBeenCalledWith('staff', { displayName: 'After' }),
    );
    await vi.waitFor(() => expect(document.body.textContent).toContain('fixture save failure'));
    const fieldLabel = [...document.querySelectorAll<HTMLLabelElement>('label')].find(
      (node) => node.textContent === '显示名称',
    )!;
    expect((document.getElementById(fieldLabel.htmlFor) as HTMLInputElement).value).toBe('After');
    await click('取消');
    await vi.waitFor(() => expect(document.body.textContent).toContain('放弃未保存的用户修改？'));
    await click('继续编辑');
    expect(document.querySelector('[role=dialog]')?.textContent).toContain('编辑用户');
  });
});
test('Ant Design refund validates remaining balance and preserves command identity after channel failure', async () => {
  mocks.role = 'finance';
  mocks.api.mockReset();
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
  mocks.api.mockImplementation(async (method: string) => {
    if (method.startsWith('GET')) return ledger;
    throw new Error('fixture channel failure');
  });
  await renderPage(<AdminItemRefundLedger orderNo="fixture" />, async (host) => {
    await act(async () => host.querySelector<HTMLElement>('.ant-collapse-header')!.click());
    await vi.waitFor(() => expect(host.textContent).toContain('Monthly hosting'));
    await input('退款金额（元）', '16');
    await input('退款原因', '经客户确认的费用补偿');
    await click('核对退款申请');
    await vi.waitFor(() => expect(host.textContent).toContain('不超过可退余额'));
    expect(mocks.api.mock.calls.filter((call) => String(call[0]).startsWith('POST'))).toHaveLength(
      0,
    );
    await input('退款金额（元）', '5.25');
    await click('核对退款申请');
    await vi.waitFor(() => expect(document.body.textContent).toContain('确认发起分项退款？'));
    await click('确认发起退款');
    await vi.waitFor(() =>
      expect(document.querySelector('[role=dialog]')?.textContent).toContain(
        'fixture channel failure',
      ),
    );
    await click('确认发起退款');
    await vi.waitFor(() =>
      expect(
        mocks.api.mock.calls.filter((call) => String(call[0]).startsWith('POST')),
      ).toHaveLength(2),
    );
    const commands = mocks.api.mock.calls
      .filter((call) => String(call[0]).startsWith('POST'))
      .map((call) => JSON.parse(call[2].body));
    expect(commands[0]).toMatchObject({
      kind: 'hosting',
      amount: 525,
      reason: '经客户确认的费用补偿',
    });
    expect(commands[1].requestId).toBe(commands[0].requestId);
  });
});
