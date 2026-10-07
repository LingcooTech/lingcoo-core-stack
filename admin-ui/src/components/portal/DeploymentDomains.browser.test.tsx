import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { DeploymentDomains } from './DeploymentDomains';
const mocks = vi.hoisted(() => ({ list: vi.fn(), verify: vi.fn(), add: vi.fn(), remove: vi.fn() }));
vi.mock('@/api/user', () => ({
  listDeploymentDomains: mocks.list,
  verifyDeploymentDomain: mocks.verify,
  addDeploymentDomain: mocks.add,
  removeDeploymentDomain: mocks.remove,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
test('domain instructions stay visible while HTTPS is pending and verification refreshes status', async () => {
  const pending = {
    id: 'domain-id',
    hostname: 'retail.example.com',
    state: 'pending_dns',
    verificationName: '_lingcoo.retail.example.com',
    verificationValue: 'lingcoo-verification=test',
    cnameTarget: 'customer.app.lingcoo.com',
    ipv4Target: '192.0.2.1',
    accessUrl: null,
  };
  mocks.list.mockResolvedValue({ items: [pending] });
  mocks.verify.mockImplementation(async () => {
    mocks.list.mockResolvedValue({
      items: [{ ...pending, state: 'ready', accessUrl: 'https://retail.example.com' }],
    });
    return pending;
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <DeploymentDomains deploymentId="deployment-id" />
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => expect(host.textContent).toContain('等待解析验证'));
    expect(host.textContent).toContain('customer.app.lingcoo.com');
    expect(host.textContent).toContain('_lingcoo.retail.example.com');
    expect(host.querySelector('a')).toBeNull();
    const button = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent === '检查解析',
    )!;
    await act(async () => button.click());
    await vi.waitFor(() =>
      expect(host.querySelector('a')?.href).toBe('https://retail.example.com/'),
    );
    expect(mocks.verify).toHaveBeenCalledWith('deployment-id', 'domain-id');
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  }
});
