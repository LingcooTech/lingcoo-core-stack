import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App, ConfigProvider } from 'antd';
import { expect, test, vi } from 'vitest';
import { SiteSettingsPanel } from './SiteSettingsPanel';
import { ContentImportSettingsPanel } from './ContentImportSettingsPanel';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));
const site = (name = 'Fixture Stack') => ({
  configured: true,
  source: 'database',
  values: {
    siteName: name,
    logoUrl: '',
    faviconUrl: '',
    brandPrimaryColor: '#2563eb',
    headerNavigation: [],
    footerCopyright: '© {year} Fixture',
    filingInfo: '',
    footerLinks: [],
  },
});
async function mount(element: ReactNode) {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  await act(async () =>
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <ConfigProvider theme={{ token: { motion: false } }}>
            <App>{element}</App>
          </ConfigProvider>
        </QueryClientProvider>
      </MemoryRouter>,
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
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.replace(/\s/g, '') === text.replace(/\s/g, ''),
  );
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
test('site settings hydrate async data, keep unsaved edits on background refresh and submit nested navigation with Zod output', async () => {
  mocks.api.mockReset();
  let saved = site();
  mocks.api.mockImplementation(async (id: string, _path: string, options?: { body: string }) => {
    if (id.startsWith('PUT')) saved = { ...saved, values: JSON.parse(options!.body) };
    return saved;
  });
  const view = await mount(<SiteSettingsPanel />);
  try {
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>('#site_siteName')?.value).toBe(
        'Fixture Stack',
      ),
    );
    await input('site_siteName', '  Customer Brand  ');
    saved = site('Background Brand');
    await act(async () => {
      await view.client.invalidateQueries({ queryKey: ['system-settings', 'site'] });
    });
    expect(document.querySelector<HTMLInputElement>('#site_siteName')!.value).toBe(
      '  Customer Brand  ',
    );
    await click('添加一级菜单');
    await input('site_headerNavigation_0_label', '  产品  ');
    await click('添加二级菜单');
    await input('site_headerNavigation_0_children_0_label', '  Retail  ');
    await input('site_headerNavigation_0_children_0_url', '  /apps/retail  ');
    await click('保存品牌与页脚');
    await vi.waitFor(() =>
      expect(mocks.api.mock.calls.some((call) => String(call[0]).startsWith('PUT'))).toBe(true),
    );
    const call = mocks.api.mock.calls.find((call) => String(call[0]).startsWith('PUT'))!;
    expect(JSON.parse(call[2].body)).toMatchObject({
      siteName: 'Customer Brand',
      headerNavigation: [
        { label: '产品', url: '', children: [{ label: 'Retail', url: '/apps/retail' }] },
      ],
    });
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>('#site_siteName')!.value).toBe(
        'Customer Brand',
      ),
    );
    expect(view.client.getQueryData(['public-site-settings'])).toMatchObject({
      siteName: 'Customer Brand',
    });
  } finally {
    await view.dispose();
  }
});
test('import configuration retains failed secret edits and clears them after successful save without sending untouched secrets', async () => {
  mocks.api.mockReset();
  let writes = 0;
  const overview = {
    configured: true,
    source: 'database',
    values: { wordpress: { siteUrl: 'https://wp.example.test', username: 'editor' }, notion: {} },
    secrets: {
      wordpress: { appPassword: { configured: true } },
      notion: { apiToken: { configured: true } },
    },
  };
  mocks.api.mockImplementation(async (id: string) => {
    if (id.startsWith('PUT') && ++writes === 1) throw new Error('Fixture save failure');
    return overview;
  });
  const view = await mount(<ContentImportSettingsPanel />);
  try {
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLInputElement>('#content-import_wordpressUsername')?.value,
      ).toBe('editor'),
    );
    await input('content-import_wordpressAppPassword', 'fixture-replacement-password');
    await click('保存内容导入配置');
    await vi.waitFor(() => expect(writes).toBe(1));
    expect(
      document.querySelector<HTMLInputElement>('#content-import_wordpressAppPassword')!.value,
    ).toBe('fixture-replacement-password');
    await click('保存内容导入配置');
    await vi.waitFor(() => expect(writes).toBe(2));
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLInputElement>('#content-import_wordpressAppPassword')!.value,
      ).toBe(''),
    );
    const calls = mocks.api.mock.calls.filter((call) => String(call[0]).startsWith('PUT'));
    expect(JSON.parse(calls[0]![2].body)).toEqual({
      wordpress: {
        siteUrl: 'https://wp.example.test',
        username: 'editor',
        appPassword: 'fixture-replacement-password',
      },
      notion: {},
    });
  } finally {
    await view.dispose();
  }
});
