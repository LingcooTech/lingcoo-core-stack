import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DeploymentWizard, type DeployableAppOption } from './DeploymentWizard';
const mocks = vi.hoisted(() => ({ options: vi.fn(), retry: vi.fn(), error: vi.fn() }));
vi.mock('@/api/user', () => ({
  getDeploymentOptions: mocks.options,
  retryManagedAllocation: mocks.retry,
}));
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: vi.fn() } }));
const options: DeployableAppOption[] = [
  {
    appCode: 'retail',
    appName: 'Retail',
    appType: 'web',
    featureCount: 1,
    defaultInstallPath: '/opt/retail',
    managedAvailable: true,
    manifest: {
      version: '1',
      installer: {
        repoUrl: '',
        repoBranch: 'main',
        remoteInstallScriptUrl: '',
        installPath: '/opt/retail',
      },
      groups: [],
      domainSlots: [
        {
          key: 'primary',
          label: '应用域名',
          envKey: 'DOMAIN',
          sourceField: 'primaryDomain',
          required: true,
        },
      ],
      envFields: [],
      secretFields: [],
      assets: [],
      notes: [],
    },
    entitlements: [
      {
        id: 'entitlement',
        planCode: 'basic',
        planName: 'Basic',
        expiresAt: null,
        activeDeploymentCount: 0,
        maxActiveDeployments: 1,
        domainBindingMode: 'none',
        domainBindingSource: 'primaryDomain',
        domainBindingScope: 'exact_host',
        boundDomain: null,
      },
    ],
  },
];
let root: Root, host: HTMLDivElement, client: QueryClient;
const create = vi.fn(),
  issue = vi.fn();
beforeEach(async () => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetAllMocks();
  mocks.options.mockResolvedValue({
    modes: ['self_hosted', 'managed'],
    managedDomainSuffix: 'app.lingcoo.com',
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['deployment-options'], {
    modes: ['self_hosted', 'managed'],
    managedDomainSuffix: 'app.lingcoo.com',
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <DeploymentWizard
          options={options}
          initialAppCode="retail"
          onCreateDeployment={create}
          onIssueToken={issue}
          creating={false}
          issuing={false}
        />
      </QueryClientProvider>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
function button(text: string) {
  const found = Array.from(host.querySelectorAll('button')).find(
    (el) => el.textContent?.trim() === text,
  );
  if (!found) throw new Error(`Missing button ${text}`);
  return found;
}
async function fill(id: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`Missing input ${id}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
test('managed application sends no server fields and never issues an installation token', async () => {
  await expect.poll(() => button('平台托管').disabled).toBe(false);
  await act(async () => button('平台托管').click());
  await fill('wizard-label', 'Retail instance');
  create.mockResolvedValue({
    id: 'deployment',
    managed: {
      prefix: 'my-shop',
      hostname: 'my-shop.app.lingcoo.com',
      state: 'waiting_capacity',
      nodeAssigned: false,
      accessUrl: null,
    },
  });
  await act(async () => button('提交托管申请').click());
  expect(create).toHaveBeenCalledOnce();
  expect(create.mock.calls[0]![0]).toMatchObject({
    deploymentMode: 'managed',
    serverHost: undefined,
    domainValues: undefined,
    installPath: undefined,
  });
  expect(issue).not.toHaveBeenCalled();
  expect(host.textContent).toContain('目前不可访问');
  expect(host.querySelector('a[href="https://my-shop.app.lingcoo.com"]')).toBeNull();
});
test('self-hosted setup requires a real server IP before creating a deployment', async () => {
  await fill('wizard-label', 'Retail instance');
  await act(async () => button('创建部署').click());
  expect(create).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledWith('请填写有效的服务器 IPv4 或 IPv6 地址');
  await fill('wizard-server', '192.0.2.10');
  await fill('wizard-domain-primary', 'shop.example.com');
  create.mockResolvedValue({ id: 'deployment', managed: null });
  issue.mockRejectedValue(new Error('test token unavailable'));
  await act(async () => button('创建部署').click());
  expect(create.mock.calls[0]![0]).toMatchObject({
    deploymentMode: 'self_hosted',
    serverHost: '192.0.2.10',
    domainValues: { primaryDomain: 'shop.example.com' },
  });
  expect(issue).toHaveBeenCalledOnce();
});

test('background capacity refresh preserves the selected mode and customer draft', async () => {
  await expect.poll(() => button('平台托管').disabled).toBe(false);
  await act(async () => button('平台托管').click());
  await fill('wizard-label', 'Keep my draft');
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <DeploymentWizard
          options={options.map((item) => ({ ...item }))}
          initialAppCode="retail"
          onCreateDeployment={create}
          onIssueToken={issue}
          creating={false}
          issuing={false}
        />
      </QueryClientProvider>,
    ),
  );
  expect(button('提交托管申请').disabled).toBe(false);
  expect(host.querySelector<HTMLInputElement>('#wizard-label')?.value).toBe('Keep my draft');
});
