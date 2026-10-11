import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ConfigProvider, Form } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { AppReadiness } from '@/components/apps/app-edit/AppReadiness';
import { AppDeliverySection } from './AppDeliverySection';
import {
  computeDeliveryConfigured,
  isDeliveryFieldConfigured,
  type DeliveryManifest,
} from '@/lib/app-delivery';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
async function mount(element: React.ReactNode) {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
    dispose: async () => {
      await act(async () => root.unmount());
      client.clear();
      host.remove();
    },
  };
}
test('compact readiness counts only configuration checks and links to the incomplete editor tab', async () => {
  mocks.api.mockResolvedValue({
    configurationReady: false,
    checks: [
      { code: 'plans', title: '套餐权益', status: 'passed', blocking: true, detail: '已关联' },
      {
        code: 'offers',
        title: '有效售价',
        status: 'blocked',
        blocking: true,
        detail: '需要正式售价',
      },
      {
        code: 'commerce_live',
        title: '真实支付',
        status: 'unverified',
        blocking: false,
        detail: '上线验收',
      },
    ],
  });
  const navigate = vi.fn();
  const view = await mount(<AppReadiness appCode="sample" dirty onNavigate={navigate} />);
  try {
    await expect
      .element(page.getByRole('button', { name: '配置检查 1/2', exact: true }))
      .toBeVisible();
    expect(view.host.querySelector('.ant-card')).toBeNull();
    await page.getByRole('button', { name: '配置检查 1/2', exact: true }).click();
    await expect
      .element(page.getByText('当前有未保存修改，检查结果仍对应上次保存的配置。'))
      .toBeVisible();
    await page.getByRole('button', { name: '去配置', exact: true }).click();
    expect(navigate).toHaveBeenCalledWith('offers');
  } finally {
    await view.dispose();
  }
});
test('delivery source must be saved before synchronization to avoid fetching the old source', async () => {
  const source = {
    repoUrl: '',
    repoBranch: 'main',
    manifestPath: 'fd-delivery.manifest.json',
    manifestUrl: 'https://example.test/old.json',
  };
  const sync = vi.fn();
  const view = await mount(
    <Form initialValues={{ source, delivery: { values: {}, secrets: {} } }}>
      <AppDeliverySection
        manifest={null}
        secrets={{}}
        create={false}
        savedSource={source}
        busy={false}
        onSync={sync}
        onClear={() => {}}
      />
    </Form>,
  );
  try {
    await expect.element(page.getByRole('button', { name: '同步清单', exact: true })).toBeEnabled();
    await page.getByLabelText('清单 URL（推荐）').fill('https://example.test/new.json');
    await expect
      .element(page.getByRole('button', { name: '同步清单', exact: true }))
      .toBeDisabled();
    expect(sync).not.toHaveBeenCalled();
  } finally {
    await view.dispose();
  }
});
test('delivery progress accepts newly entered secrets and false booleans but rejects missing manifests and placeholders', () => {
  const secret = {
    key: 'TOKEN',
    label: 'Token',
    type: 'secret',
    scope: 'preset',
    required: true,
    editable: true,
    advanced: false,
  } as const;
  const bool = { ...secret, key: 'ENABLED', type: 'boolean' } as const;
  const manifest: DeliveryManifest = {
    version: '1',
    installer: {
      repoUrl: '',
      repoBranch: 'main',
      remoteInstallScriptUrl: 'https://example.test/install.sh',
      installPath: '/opt/app',
    },
    groups: [],
    domainSlots: [],
    envFields: [bool],
    secretFields: [secret],
    assets: [],
    notes: [],
  };
  const draft = { values: { ENABLED: false }, secrets: { TOKEN: 'new-secret' } };
  expect(computeDeliveryConfigured(manifest, draft, {})).toBe(true);
  expect(computeDeliveryConfigured(null, draft, {})).toBe(false);
  expect(computeDeliveryConfigured(manifest, { ...draft, secrets: {} }, {})).toBe(false);
  expect(computeDeliveryConfigured(manifest, { ...draft, secrets: {} }, { TOKEN: true })).toBe(
    true,
  );
  expect(
    isDeliveryFieldConfigured(
      { ...bool, type: 'text' },
      { values: { ENABLED: 'PENDING_IMAGE' }, secrets: {} },
      {},
    ),
  ).toBe(false);
});
