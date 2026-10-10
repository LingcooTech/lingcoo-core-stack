import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  createMemoryRouter,
  createRoutesFromElements,
  RouterProvider,
  Route,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ThemeProvider } from '@/lib/theme';
import { AdminShell } from './AdminShell';
import { PageContainer } from './PageContainer';
import { LoginPage } from '@/pages/LoginPage';

const mocks = vi.hoisted(() => ({
  role: 'support',
  login: vi.fn(),
  authLogin: vi.fn(),
  logout: vi.fn(),
  endSession: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { email: 'support@example.test', role: mocks.role },
    isAuthenticated: false,
    login: mocks.authLogin,
    logout: mocks.logout,
  }),
}));
vi.mock('@/api/auth', () => ({
  getCurrentUser: async () => ({ user: { displayName: 'Support', email: 'support@example.test' } }),
  bootstrapStatus: async () => ({ hasAdmin: true }),
  login: mocks.login,
  logoutSession: mocks.endSession,
}));
vi.mock('@/api/settings', () => ({
  getPublicSiteSettings: async () => ({ siteName: 'Test platform', brandPrimaryColor: '#123abc' }),
}));

let host: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  mocks.role = 'support';
  localStorage.removeItem('fd-core:theme');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
async function mount(login = false) {
  const router = createMemoryRouter(
    createRoutesFromElements(
      <>
        <Route path="/admin/login" element={<LoginPage />} />
        <Route element={<AdminShell />}>
          <Route
            path="/admin/orders"
            element={
              <PageContainer title="订单详情测试">
                <span>page fixture</span>
              </PageContainer>
            }
          />
        </Route>
      </>,
    ),
    { initialEntries: [login ? '/admin/login' : '/admin/orders'] },
  );
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </QueryClientProvider>,
    ),
  );
}
function clickText(text: string) {
  const button = [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.replace(/\s/g, '') === text,
  );
  if (!button) throw new Error(`Missing button: ${text}`);
  button.click();
}
function input(label: string, value: string) {
  const field = [...host.querySelectorAll('input')].find(
    (item) => document.querySelector(`label[for="${item.id}"]`)?.textContent === label,
  );
  if (!field) throw new Error(`Missing field: ${label}`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
test('admin shell uses the page title and filters navigation and search by role', async () => {
  await mount();
  await vi.waitFor(() => expect(host.textContent).toContain('page fixture'));
  expect(host.querySelector('.admin-header')?.textContent).toContain('订单详情测试');
  if (!document.querySelector('.admin-navigation')) {
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="打开侧边栏"]')!.click(),
    );
  }
  await vi.waitFor(() => expect(document.querySelector('.admin-navigation')).not.toBeNull());
  expect(document.querySelector('.admin-navigation')?.textContent).not.toContain('系统设置');
  const closeNavigation = document.querySelector<HTMLButtonElement>('.ant-drawer-close');
  if (closeNavigation) await act(async () => closeNavigation.click());
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
    ),
  );
  await vi.waitFor(() => expect(document.querySelector('[role=dialog]')).not.toBeNull());
  const search = document.querySelector<HTMLInputElement>('[aria-label="搜索页面、资源、操作"]')!;
  await act(async () => {
    search.focus();
    search.dispatchEvent(new Event('focusin', { bubbles: true }));
  });
  expect(document.querySelector('[role=dialog]')?.textContent).not.toContain('系统设置');
});
test('theme choices persist and change the Ant Design theme without leaving the page', async () => {
  await mount();
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="切换主题"]')!.click());
  await vi.waitFor(() => expect(document.body.textContent).toContain('跟随系统'));
  await act(async () =>
    [...document.querySelectorAll('[role=menuitem]')]
      .find((item) => item.textContent?.includes('深色'))!
      .dispatchEvent(new MouseEvent('click', { bubbles: true })),
  );
  await vi.waitFor(() => expect(localStorage.getItem('fd-core:theme')).toBe('dark'));
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  expect(host.textContent).toContain('page fixture');
});
test('admin login validates before requesting and preserves input on failure', async () => {
  mocks.login.mockRejectedValue(new Error('fixture authentication failed'));
  await mount(true);
  await vi.waitFor(() => expect(host.querySelector('form')).not.toBeNull());
  await act(async () => clickText('登录'));
  await vi.waitFor(() => expect(host.textContent).toContain('请输入邮箱'));
  expect(mocks.login).not.toHaveBeenCalled();
  await act(async () => {
    input('邮箱', 'admin@example.test');
    input('密码', 'long-password-only');
  });
  await act(async () => clickText('登录'));
  await vi.waitFor(() => expect(host.textContent).toContain('fixture authentication failed'));
  expect(mocks.login).toHaveBeenCalledWith('admin@example.test', 'long-password-only');
  expect(host.querySelector<HTMLInputElement>('input[autocomplete=email]')?.value).toBe(
    'admin@example.test',
  );
});
test('customer credentials cannot establish an admin session', async () => {
  mocks.login.mockResolvedValue({ user: { role: 'user' } });
  await mount(true);
  await vi.waitFor(() => expect(host.querySelector('form')).not.toBeNull());
  await act(async () => {
    input('邮箱', 'customer@example.test');
    input('密码', 'long-password-only');
  });
  await act(async () => clickText('登录'));
  await vi.waitFor(() => expect(host.textContent).toContain('该账号没有管理后台访问权限'));
  expect(mocks.endSession).toHaveBeenCalledOnce();
  expect(mocks.authLogin).not.toHaveBeenCalled();
});
