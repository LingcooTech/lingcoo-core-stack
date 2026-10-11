import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { AppComposePlan } from './AppComposePlan';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
test('Compose preview uses the immutable release, shows budgets and required fields, and retries failed reads', async () => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let fail = true;
  mocks.api.mockImplementation(async (id: string, path: string, options: { body: string }) => {
    expect(id).toBe('POST /v1/admin/apps/:param/releases/:param/plan');
    expect(path).toContain('/apps/sample/releases/release-1/plan');
    const input = JSON.parse(options.body);
    expect(input.mode).toBe('self_hosted');
    expect(input.instanceId).toMatch(/^[a-f0-9-]{36}$/);
    if (fail) throw Error('Preview temporarily unavailable');
    return {
      executionEnabled: false,
      plan: {
        version: '1.0.0',
        releaseDigest: 'sha256:' + 'a'.repeat(64),
        project: 'stack-example',
        resources: { cpuMillis: 500, memoryMb: 256, diskMb: 1024 },
        entrypoint: { service: 'web', port: 80, healthPath: '/health' },
        volumes: [],
        services: [
          {
            name: 'web',
            cpuMillis: 500,
            memoryMb: 256,
            image: 'registry.example/web@sha256:' + 'a'.repeat(64),
          },
        ],
        fields: {
          env: [],
          secrets: [{ key: 'PASSWORD', label: '数据库密码', required: true }],
          domains: [],
        },
      },
    };
  });
  async function click(text: string) {
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (v) => v.textContent?.replace(/\s/g, '') === text.replace(/\s/g, ''),
    );
    expect(button).toBeTruthy();
    await act(async () => button!.click());
  }
  try {
    await act(async () =>
      root.render(
        <ConfigProvider theme={{ token: { motion: false } }}>
          <App>
            <QueryClientProvider client={client}>
              <AppComposePlan code="sample" releaseId="release-1" modes={['self_hosted']} />
            </QueryClientProvider>
          </App>
        </ConfigProvider>,
      ),
    );
    expect(mocks.api).not.toHaveBeenCalled();
    await click('部署计划');
    await expect.poll(() => document.body.textContent).toContain('Preview temporarily unavailable');
    fail = false;
    await click('重试');
    await expect.poll(() => document.body.textContent).toContain('500 mCPU / 256 MiB');
    expect(document.body.textContent).toContain('数据库密码');
    expect(document.body.textContent).toContain('只读预览');
    expect(document.querySelectorAll('input[type="password"]').length).toBe(0);
    await act(async () => document.querySelector<HTMLButtonElement>('.ant-drawer-close')!.click());
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
