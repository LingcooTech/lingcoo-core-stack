import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { HostingInstances } from './HostingInstances';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));
test('instance management loads details on demand, reuses retry identity and blocks stale telemetry operations', async () => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  mocks.api.mockReset();
  let fresh = true,
    attempts = 0;
  const id = '00000000-0000-4000-8000-000000000001';
  mocks.api.mockImplementation(async (route: string) => {
    if (route.startsWith('POST')) {
      if (++attempts === 1) throw new Error('Fixture transport failure');
      return {};
    }
    return {
      instances: [
        {
          id,
          label: 'Customer fixture',
          appCode: 'sample',
          customerEmail: 'fixture@example.test',
          nodeId: null,
          hostname: 'fixture.app.example.test',
          state: 'ready',
          resources: { memoryMb: 512, cpuMillis: 1000, diskMb: 10240 },
          services: [],
          backup: null,
          telemetryFresh: fresh,
        },
      ],
      operations: [],
    };
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  const click = async (text: string) => {
    const el = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (n) => n.textContent?.replace(/\s/g, '') === text.replace(/\s/g, ''),
    );
    expect(el).toBeTruthy();
    await act(async () => el!.click());
  };
  try {
    await act(async () =>
      root.render(
        <ConfigProvider theme={{ token: { motion: false } }}>
          <App>
            <QueryClientProvider client={client}>
              <HostingInstances />
            </QueryClientProvider>
          </App>
        </ConfigProvider>,
      ),
    );
    await vi.waitFor(() => expect(host.textContent).toContain('Customer fixture'));
    expect(mocks.api.mock.calls.every((c) => c[0] === 'GET /v1/admin/hosting/overview')).toBe(true);
    await click('管理实例');
    expect(mocks.api.mock.calls.every((c) => c[0] === 'GET /v1/admin/hosting/overview')).toBe(true);
    await click('重启应用');
    await click('确认执行');
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Fixture transport failure'),
    );
    await click('确认执行');
    await vi.waitFor(() => expect(attempts).toBe(2));
    const calls = mocks.api.mock.calls.filter((c) => String(c[0]).startsWith('POST'));
    expect(calls[0]![2].body).toBe(calls[1]![2].body);
    expect(JSON.parse(calls[0]![2].body).kind).toBe('restart');
    fresh = false;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['hosting-overview'] });
    });
    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll<HTMLButtonElement>('button')].find(
          (b) => b.textContent?.replace(/\s/g, '') === '重启应用',
        )?.disabled,
      ).toBe(true),
    );
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});

async function mountInstance() {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  await act(async () =>
    root.render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        <App>
          <QueryClientProvider client={client}>
            <HostingInstances />
          </QueryClientProvider>
        </App>
      </ConfigProvider>,
    ),
  );
  return {
    host,
    dispose: async () => {
      await act(async () => root.unmount());
      client.clear();
      host.remove();
    },
  };
}
async function clickInstanceButton(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.replace(/\s/g, '') === text.replace(/\s/g, ''),
  );
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
test('restart confirmation creates a typed task and disables duplicate operations while pending', async () => {
  mocks.api.mockReset();
  let pending = false;
  mocks.api.mockImplementation(async (route: string) => {
    if (route.startsWith('POST')) {
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
  const view = await mountInstance();
  try {
    await vi.waitFor(() => expect(view.host.textContent).toContain('Retail fixture'));
    await clickInstanceButton('管理实例');
    await clickInstanceButton('重启应用');
    expect(mocks.api.mock.calls.filter((c) => String(c[0]).startsWith('POST'))).toHaveLength(0);
    expect(document.querySelector('.ant-modal')?.textContent).toContain('数据库继续运行');
    await clickInstanceButton('确认执行');
    await vi.waitFor(() =>
      expect(document.querySelector('.ant-drawer')?.textContent).toContain('等待执行'),
    );
    expect(
      [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.replace(/\s/g, '') === '重启应用',
      )?.disabled,
    ).toBe(true);
    const call = mocks.api.mock.calls.find((c) => String(c[0]).startsWith('POST'))!;
    expect(JSON.parse(call[2].body).kind).toBe('restart');
    expect(JSON.parse(call[2].body).requestKey).toMatch(/^[a-f0-9-]{36}$/);
  } finally {
    await view.dispose();
  }
});
test('retained instance displays intentional stop and exit backup evidence without false failure badges', async () => {
  mocks.api.mockReset();
  mocks.api.mockResolvedValue({
    instances: [
      {
        id: 'retained-id',
        label: 'Retained fixture',
        appCode: 'sample',
        customerEmail: 'owner@example.test',
        nodeId: 'node-id',
        hostname: 'retained.app.lingcoo.com',
        state: 'retained',
        resources: { memoryMb: 128 },
        services: [{ name: 'app', service: 'site', state: 'exited', health: '', memoryMb: 0 }],
        backup: null,
        telemetryFresh: true,
      },
    ],
    operations: [],
  });
  const view = await mountInstance();
  try {
    await vi.waitFor(() => expect(view.host.textContent).toContain('Retained fixture'));
    expect(view.host.textContent).toContain('已停服·保留数据');
    await clickInstanceButton('管理实例');
    const text = document.querySelector('.ant-drawer')!.textContent;
    expect(text).toContain('不再要求每日运行备份');
    expect(text).not.toContain('服务异常');
    expect(text).not.toContain('暂无成功记录');
    expect(document.querySelector('a[href="https://retained.app.lingcoo.com"]')).toBeNull();
  } finally {
    await view.dispose();
  }
});
