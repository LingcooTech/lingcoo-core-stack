import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { CurrentUser } from '@lingcoo/contracts';
import { AuthProvider, useAuth } from './auth';
import { PUBLIC_SITE_SETTINGS_QUERY_KEY } from './site-settings';
const api = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  logoutSession: vi.fn(),
  clearToken: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@/api/auth', () => ({
  getCurrentUser: api.getCurrentUser,
  logoutSession: api.logoutSession,
}));
vi.mock('@/api/client', () => ({ clearToken: api.clearToken }));
vi.mock('sonner', () => ({ toast: { error: api.toast } }));
const user: CurrentUser = {
  id: 'd022ac8b-0d36-4f28-a6de-a8fba70e5a60',
  email: 'fixture@example.test',
  displayName: null,
  role: 'admin',
  emailVerified: true,
};
let root: Root,
  host: HTMLDivElement,
  client: QueryClient,
  current: ReturnType<typeof useAuth> | undefined;
function Harness() {
  current = useAuth();
  return <div>{current.user?.email ?? 'anonymous'}</div>;
}
function context() {
  if (!current) throw new Error('Auth context not rendered');
  return current;
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function mount() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Harness />
        </AuthProvider>
      </QueryClientProvider>,
    ),
  );
}
beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetAllMocks();
  current = undefined;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});

test('a stale initial identity request cannot clear a later successful login', async () => {
  const pending = deferred<{ authenticated: true; user: CurrentUser }>();
  api.getCurrentUser.mockReturnValue(pending.promise);
  await mount();
  expect(context().isLoading).toBe(true);
  await act(async () => context().login(user));
  await act(async () => pending.reject(new Error('old anonymous request')));
  expect(context().user?.id).toBe(user.id);
  expect(context().isLoading).toBe(false);
});
test('session expiry clears private caches and preserves a pending public settings query', async () => {
  api.getCurrentUser.mockResolvedValue({ authenticated: true, user });
  await mount();
  const pending = deferred<{ siteName: string }>();
  const fetch = client.fetchQuery({
    queryKey: PUBLIC_SITE_SETTINGS_QUERY_KEY,
    queryFn: () => pending.promise,
  });
  client.setQueryData(['private-orders'], ['sensitive']);
  await act(async () => window.dispatchEvent(new Event('stack:session-expired')));
  expect(context().isAuthenticated).toBe(false);
  expect(client.getQueryData(['private-orders'])).toBeUndefined();
  expect(client.getQueryState(PUBLIC_SITE_SETTINGS_QUERY_KEY)?.fetchStatus).toBe('fetching');
  pending.resolve({ siteName: 'Public fixture' });
  await fetch;
  expect(client.getQueryData(PUBLIC_SITE_SETTINGS_QUERY_KEY)).toEqual({
    siteName: 'Public fixture',
  });
});
test('focus refresh uses the current server role and verification status', async () => {
  api.getCurrentUser.mockResolvedValueOnce({ authenticated: true, user }).mockResolvedValueOnce({
    authenticated: true,
    user: { ...user, role: 'user', emailVerified: false },
  });
  await mount();
  expect(context().isAdmin).toBe(true);
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(context().isAdmin).toBe(false);
  expect(context().isEmailVerified).toBe(false);
});
test('a failed server logout keeps the active identity and lets the caller report the failure', async () => {
  api.getCurrentUser.mockResolvedValue({ authenticated: true, user });
  api.logoutSession.mockRejectedValue(new Error('fixture offline'));
  await mount();
  await act(async () => {
    await expect(context().logout()).rejects.toThrow('fixture offline');
  });
  expect(context().isAuthenticated).toBe(true);
  expect(api.toast).not.toHaveBeenCalled();
});
