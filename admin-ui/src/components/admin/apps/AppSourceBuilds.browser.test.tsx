import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { AppSourceBuilds } from './AppSourceBuilds';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
async function mount() {
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
            <AppSourceBuilds code="sample_app" />
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
async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (v) => v.textContent?.replace(/\s/g, '') === text.replace(/\s/g, ''),
  );
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
async function fill(selector: string, value: string) {
  const node = document.querySelector<HTMLInputElement>(selector)!;
  expect(node).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const lifecycle = {
  source: {
    repository: 'https://github.com/example/app',
    commit: 'a'.repeat(40),
    ref: 'main',
    path: 'stack/app.yaml',
  },
  definition: { build: { workflow: 'publish.yml' } },
  releases: [],
};
test('build retries retain the same request ID so a lost response cannot dispatch a duplicate build', async () => {
  const requests: { requestId: string; version: string }[] = [];
  mocks.api.mockImplementation(async (id: string, _path: string, options?: { body: string }) => {
    if (id.endsWith('/lifecycle')) return lifecycle;
    if (id.startsWith('GET') && id.endsWith('/builds'))
      return { requests: [], runs: [], connected: true };
    if (id.startsWith('POST') && id.endsWith('/builds')) {
      requests.push(JSON.parse(options!.body));
      if (requests.length === 1) throw Error('response lost');
      return {
        ...requests[1],
        id: requests[1]!.requestId,
        status: 'dispatched',
        commit: 'a'.repeat(40),
        createdAt: new Date().toISOString(),
      };
    }
    throw Error(id);
  });
  const view = await mount();
  try {
    await expect.poll(() => view.host.textContent).toContain('publish.yml');
    await click('构建新版本');
    await fill('input[placeholder="1.0.0"]', '1.0.0');
    await click('提交构建');
    await expect.poll(() => document.body.textContent).toContain('response lost');
    await click('提交构建');
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[0]).toEqual(requests[1]);
  } finally {
    await view.dispose();
  }
});
test('CI credentials are displayed only after issue and cleared when the drawer closes', async () => {
  const token = 'stk_publish_' + 'a'.repeat(43);
  mocks.api.mockImplementation(async (id: string) => {
    if (id.endsWith('/lifecycle')) return lifecycle;
    if (id.endsWith('/builds')) return { requests: [], runs: [], connected: true };
    if (id.startsWith('GET') && id.endsWith('/publishing-tokens')) return { items: [] };
    if (id.startsWith('POST') && id.endsWith('/publishing-tokens')) return { token, record: {} };
    throw Error(id);
  });
  const view = await mount();
  try {
    await click('CI 发布凭证');
    await fill('input[placeholder="GitHub Actions"]', 'Actions');
    await click('生成发布凭证');
    await expect
      .poll(() => document.querySelector<HTMLInputElement>('input[readonly]')?.value)
      .toBe(token);
    const close = document.querySelector<HTMLButtonElement>('.ant-drawer-close')!;
    await act(async () => close.click());
    await click('CI 发布凭证');
    expect(document.querySelector('input[readonly]')).toBeNull();
    expect(localStorage.getItem('STACK_PUBLISH_TOKEN')).toBeNull();
  } finally {
    await view.dispose();
  }
});
