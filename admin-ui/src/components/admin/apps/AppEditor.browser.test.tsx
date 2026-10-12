import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App, ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { AppEditPage } from '@/pages/AppEditPage';
import { DocsPage } from '@/pages/DocsPage';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));
const fixture = () => ({
  id: 'app-1',
  code: 'sample_app',
  name: 'Sample App',
  type: 'web_app',
  status: 'inactive',
  meta: { deliveryMode: 'none' },
  highlights: [],
  screenshots: [],
  faq: [],
  links: [],
  features: [{ id: 'feature-1', code: 'basic', name: 'Basic', kind: 'boolean', status: 'active' }],
  plans: [
    {
      id: 'plan-1',
      code: 'monthly',
      name: 'Monthly',
      priceAmount: 1234,
      currency: 'CNY',
      interval: 'month',
      status: 'active',
      meta: {},
    },
  ],
  checkoutOffers: [
    {
      code: 'sale',
      planCode: 'monthly',
      title: 'Monthly sale',
      priceAmount: 1234,
      currency: 'CNY',
      isDefault: true,
      status: 'active',
    },
  ],
});
async function mount(path: string, element: React.ReactNode) {
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
            <MemoryRouter initialEntries={[path]}>
              <Routes>
                <Route path="/admin/apps/:appCode/edit" element={element} />
                <Route path="/admin/docs" element={element} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </App>
      </ConfigProvider>,
    ),
  );
  return {
    host,
    client,
    dispose: async () => {
      await act(async () => root.unmount());
      client.clear();
      host.remove();
    },
  };
}
async function input(id: string, value: string) {
  const node = document.getElementById(id) as HTMLInputElement;
  expect(node).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function click(text: string) {
  const el = [...document.querySelectorAll<HTMLElement>('button,[role=tab]')].find(
    (n) => n.textContent?.replace(/\s/g, '') === text.replace(/\s/g, ''),
  );
  expect(el).toBeTruthy();
  await act(async () => el!.click());
}
function setup() {
  let app = fixture();
  let fail = true;
  const requests: Record<string, unknown>[] = [];
  mocks.api.mockReset();
  mocks.api.mockImplementation(async (id: string, _path: string, options?: { body: string }) => {
    if (id.includes('/readiness')) return { configurationReady: false, checks: [] };
    if (id === 'GET /v1/admin/development/projects/:param')
      return { source: null, definition: null, releases: [] };
    if (id === 'GET /v1/admin/apps') return { items: [app] };
    if (id === 'GET /v1/catalog')
      return { planFeatures: [{ planId: 'plan-1', featureId: 'feature-1' }] };
    if (id.startsWith('GET') && id.includes('/delivery-settings'))
      return { values: {}, secrets: {} };
    if (id.startsWith('PUT') && id.includes('/apps/')) {
      const body = JSON.parse(options!.body);
      requests.push(body);
      if (fail) throw new Error('Fixture save conflict');
      app = {
        ...app,
        ...body,
        features: body.features.map((f: object) => ({ id: 'feature-1', ...f })),
        plans: body.plans.map((p: object) => ({ id: 'plan-1', ...p })),
        checkoutOffers: body.offers,
      };
      return app;
    }
    return { values: {}, secrets: {} };
  });
  return {
    requests,
    allowSave: () => {
      fail = false;
    },
  };
}
test('application feature and plan renames preserve offer relations, cents and failed drafts', async () => {
  const setupState = setup(),
    view = await mount('/admin/apps/sample_app/edit', <AppEditPage />);
  try {
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>('#app-editor_app_name')?.value).toBe(
        'Sample App',
      ),
    );
    await input('app-editor_app_name', 'Edited App');
    await click('功能');
    await input('app-editor_features_0_code', 'basic_plus');
    await click('套餐');
    await input('app-editor_plans_0_code', 'monthly_plus');
    await click('保存应用配置');
    await vi.waitFor(() => expect(setupState.requests).toHaveLength(1));
    expect(document.querySelector<HTMLInputElement>('#app-editor_app_name')!.value).toBe(
      'Edited App',
    );
    expect(setupState.requests[0]!.plans).toMatchObject([
      { code: 'monthly_plus', featureCodes: ['basic_plus'], priceAmount: 1234 },
    ]);
    expect(setupState.requests[0]!.offers).toMatchObject([
      { planCode: 'monthly_plus', isDefault: true, priceAmount: 1234 },
    ]);
    setupState.allowSave();
    await click('保存应用配置');
    await vi.waitFor(() => expect(setupState.requests).toHaveLength(2));
    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll<HTMLButtonElement>('button')].find(
          (b) => b.textContent === '保存应用配置',
        )?.disabled,
      ).toBe(true),
    );
  } finally {
    await view.dispose();
  }
}, 45000);
test('document manager can create a fresh space without auto-selecting the existing space or losing failed input', async () => {
  mocks.api.mockReset();
  const space = {
    id: 'space-1',
    title: 'Existing Space',
    slug: 'existing',
    description: '',
    iconUrl: '',
    type: 'product',
    appId: null,
    sortOrder: 0,
    status: 'active',
    meta: {},
    pageCount: 0,
  };
  mocks.api.mockImplementation(async (id: string) => {
    if (id === 'GET /v1/admin/docs/spaces') return { items: [space] };
    if (id === 'GET /v1/admin/docs/spaces/:param') return { space, pages: [], tree: [] };
    if (id === 'GET /v1/admin/development/projects/:param')
      return { source: null, definition: null, releases: [] };
    if (id === 'GET /v1/admin/apps') return { items: [] };
    if (id.startsWith('POST')) throw new Error('Fixture validation failed');
    return {};
  });
  const view = await mount('/admin/docs', <DocsPage />);
  try {
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>('#doc-space_title')?.value).toBe(
        'Existing Space',
      ),
    );
    await click('新建空间');
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>('#doc-space_title')?.value).toBe(''),
    );
    await input('doc-space_title', 'New Space');
    await input('doc-space_slug', 'new-space');
    await click('保存空间');
    await vi.waitFor(() =>
      expect(mocks.api.mock.calls.some((c) => c[0] === 'POST /v1/admin/docs/spaces')).toBe(true),
    );
    expect(document.querySelector<HTMLInputElement>('#doc-space_title')!.value).toBe('New Space');
  } finally {
    await view.dispose();
  }
});

test('product editor displays delivery information without source or preset fields', async () => {
  setup();
  const view = await mount('/admin/apps/sample_app/edit', <AppEditPage />);
  try {
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>('#app-editor_app_name')?.value).toBe(
        'Sample App',
      ),
    );
    await click('交付信息');
    expect(view.host.textContent).toContain('平台交付预设');
    expect(view.host.textContent).not.toContain('源码与交付版本');
    expect(view.host.querySelector('[id*="source_manifestUrl"]')).toBeNull();
    expect(view.host.querySelector('[id*="delivery_values"]')).toBeNull();
    expect(
      view.host.querySelector('a[href="/admin/development/projects/sample_app/delivery-settings"]'),
    ).toBeTruthy();
  } finally {
    await view.dispose();
  }
});
