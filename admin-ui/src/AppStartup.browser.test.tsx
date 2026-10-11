import '@/index.css';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';

const mocks = vi.hoisted(() => ({ settings: vi.fn(), me: vi.fn() }));
vi.mock('@/api/settings', () => ({ getPublicSiteSettings: mocks.settings }));
vi.mock('@/api/auth', async (original) => ({
  ...(await original<object>()),
  getCurrentUser: mocks.me,
}));
vi.mock('@/components/layout/UserShell', async () => {
  const { Link } = await import('react-router-dom');
  const { RouteSlot } = await import('@/components/layout/RouteSlot');
  return {
    UserShell: () => (
      <>
        <header>
          Public navigation<Link to="/admin">Open admin</Link>
        </header>
        <main>
          <RouteSlot />
        </main>
      </>
    ),
  };
});
vi.mock('@/components/portal/PortalUiProvider', async () => {
  const { Outlet } = await import('react-router-dom');
  return { PortalUiProvider: Outlet };
});
vi.mock('@/components/admin/AdminShell', async () => {
  const { Outlet } = await import('react-router-dom');
  return {
    AdminShell: () => (
      <>
        <header>Verified admin navigation</header>
        <main>
          <Outlet />
        </main>
      </>
    ),
  };
});
vi.mock('@/pages/HomePage', () => ({ HomePage: () => <h1>Public catalog ready</h1> }));
vi.mock('@/pages/DashboardPage', () => ({ DashboardPage: () => <h1>Protected dashboard</h1> }));
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});

test('slow settings never block public content; slow authentication hides protected menus and content', async () => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState(null, '', '/');
  mocks.settings.mockImplementation(() => new Promise(() => {}));
  let finishAuth!: (value: unknown) => void;
  const auth = new Promise((resolve) => {
    finishAuth = resolve;
  });
  mocks.me.mockReturnValue(auth);
  const { default: App } = await import('./App');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  cleanup = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  await act(async () => root.render(<App />));
  await expect.element(page.getByRole('heading', { name: 'Public catalog ready' })).toBeVisible();
  expect(mocks.settings).toHaveBeenCalled();
  await page.getByRole('link', { name: 'Open admin' }).click();
  await expect.poll(() => !!host.querySelector('[data-loading-shell="admin"]')).toBe(true);
  expect(host.textContent).not.toContain('Protected dashboard');
  expect(host.textContent).not.toContain('Verified admin navigation');
  await act(async () =>
    finishAuth({
      user: { id: 'test-admin', role: 'admin', email: 'admin@example.test', emailVerified: true },
    }),
  );
  await expect.element(page.getByRole('heading', { name: 'Protected dashboard' })).toBeVisible();
  expect(host.textContent).toContain('Verified admin navigation');
  expect(host.textContent).not.toContain('正在加载页面');
});
