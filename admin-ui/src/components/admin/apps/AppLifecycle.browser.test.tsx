import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App, ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { AppImportPage } from '@/pages/AppImportPage';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
const preview = {
  definition: {
    schemaVersion: 1,
    app: { code: 'sample_free', name: '开源应用', license: 'MIT', acquisition: 'free' },
    images: [],
    features: [],
    delivery: { kind: 'none' },
  },
  source: null,
  definitionDigest: 'sha256:test',
  warnings: ['导入只创建草稿'],
};
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
            <MemoryRouter initialEntries={['/admin/development/projects/new']}>
              <Routes>
                <Route path="/admin/development/projects/new" element={<AppImportPage />} />
                <Route
                  path="/admin/development/projects/:code"
                  element={<div>开发项目目标页</div>}
                />
              </Routes>
            </MemoryRouter>
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
  const node = [...document.querySelectorAll<HTMLElement>('button,[role=tab]')].find(
    (v) => v.textContent?.replace(/\s/g, '') === text.replace(/\s/g, ''),
  );
  expect(node).toBeTruthy();
  await act(async () => node!.click());
}
async function paste(text: string) {
  const node = document.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(node, text);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
test('file import requires a preview, invalidates stale preview, and creates a development project without creating a product', async () => {
  const calls: string[] = [];
  mocks.api.mockImplementation(async (id: string) => {
    calls.push(id);
    if (id === 'GET /v1/admin/app-connections') return { items: [] };
    if (id.endsWith('/preview')) return preview;
    if (id === 'POST /v1/admin/development/projects') return { projectCode: 'sample_free' };
    throw Error(id);
  });
  const view = await mount();
  try {
    await click('上传交付定义');
    await paste(JSON.stringify(preview.definition));
    expect(view.host.textContent).not.toContain('创建开发项目');
    await click('读取并校验');
    await expect.poll(() => view.host.textContent).toContain('创建开发项目');
    expect(calls).not.toContain('POST /v1/admin/development/projects');
    await paste(
      JSON.stringify({
        ...preview.definition,
        app: { ...preview.definition.app, name: 'changed' },
      }),
    );
    expect(view.host.textContent).not.toContain('创建开发项目');
    await click('读取并校验');
    await expect.poll(() => view.host.textContent).toContain('创建开发项目');
    await click('创建开发项目');
    await expect.poll(() => view.host.textContent).toContain('开发项目目标页');
  } finally {
    await view.dispose();
  }
});
test('repository import defaults to public access and reports read failures without creating apps', async () => {
  const calls: string[] = [];
  mocks.api.mockImplementation(async (id: string) => {
    calls.push(id);
    if (id === 'GET /v1/admin/app-connections') return { items: [] };
    throw Error('GitHub returned 404');
  });
  const view = await mount();
  try {
    expect(view.host.textContent).toContain('公开仓库');
    const node = document.querySelector<HTMLInputElement>('input[placeholder^="https://github"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        node,
        'https://github.com/example/app',
      );
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('读取并校验');
    await expect.poll(() => document.body.textContent).toContain('GitHub returned 404');
    expect(view.host.textContent).not.toContain('创建开发项目');
    expect(calls).not.toContain('POST /v1/admin/development/projects');
  } finally {
    await view.dispose();
  }
});
