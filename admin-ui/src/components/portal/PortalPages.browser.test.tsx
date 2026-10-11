import '@/index.css';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { page, userEvent } from 'vitest/browser';
import { ApiError } from '@/api/client';
import { afterEach, expect, test, vi } from 'vitest';
import { HomePage } from '@/pages/HomePage';
import { AppCatalogPage } from '@/pages/AppCatalogPage';
import { AccountCenterPage } from '@/pages/AccountCenterPage';
import { BrandMark } from './BrandMark';
const mocks = vi.hoisted(() => ({ apps: vi.fn(), catalog: vi.fn() }));
vi.mock('@/api/apps', () => ({ listApps: mocks.apps, getAppCatalog: mocks.catalog }));
vi.mock('@/api/settings', () => ({
  getPublicSiteSettings: async () => ({ siteName: 'Test shop' }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ isAuthenticated: false }) }));
vi.mock('@/api/user', async (original) => ({
  ...(await original<object>()),
  listMyOrders: async () => ({ items: [] }),
}));
let host: HTMLDivElement, root: Root, client: QueryClient;
async function mount(element: React.ReactNode, path = '/') {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="*"
              element={<div className="mx-auto max-w-container px-4">{element}</div>}
            />
            <Route
              path="/apps/:appCode"
              element={<div className="mx-auto max-w-container px-4">{element}</div>}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  client?.clear();
  host?.remove();
  vi.clearAllMocks();
  await page.viewport(1280, 720);
});
test('failed catalog listing offers retry instead of claiming there are no apps', async () => {
  mocks.apps.mockRejectedValueOnce(new Error('503')).mockResolvedValue({ items: [] });
  await mount(<HomePage />);
  await expect.element(page.getByRole('alert')).toHaveTextContent('暂时无法加载');
  expect(host.textContent).not.toContain('暂无应用');
  await act(async () => page.getByRole('button', { name: '重新加载' }).click());
  await expect.element(page.getByText('暂无应用', { exact: true })).toBeVisible();
});
test('detail distinguishes server failure from missing content', async () => {
  mocks.catalog.mockRejectedValue(new Error('503'));
  await mount(<AppCatalogPage />, '/apps/retail');
  await expect.element(page.getByRole('alert')).toHaveTextContent('暂时无法加载');
  expect(host.textContent).not.toContain('内容不存在');
});
test('desktop catalog uses two columns and keyboard accessible tabs and FAQ', async () => {
  await page.viewport(1440, 900);
  mocks.catalog.mockResolvedValue({
    app: {
      id: 'app',
      code: 'retail',
      name: 'Retail',
      status: 'active',
      type: 'web',
      meta: {},
      highlights: [],
      screenshots: [],
      content: 'Application description',
      faq: [{ question: 'How to deploy?', answer: 'Choose hosting.' }],
      links: [],
      updatedAt: '2026-10-11',
    },
    offers: [],
    plans: [],
    features: [],
    planFeatures: [],
  });
  await mount(<AppCatalogPage />, '/apps/retail');
  await expect.element(page.getByRole('heading', { name: 'Retail', exact: true })).toBeVisible();
  const price = Array.from(host.querySelectorAll('p')).find((p) => p.textContent === '价格')!;
  const grid = price.closest('aside')!.parentElement!;
  expect(getComputedStyle(grid).gridTemplateColumns.split(' ')).toHaveLength(2);
  expect(host.textContent).toContain('即将开放');
  expect(host.textContent).not.toContain('未设置');
  const tabs = page.getByRole('tablist', { name: '应用详情' });
  await act(async () => tabs.getByRole('tab', { name: '应用介绍' }).click());
  await act(async () => userEvent.keyboard('{ArrowRight}'));
  await expect
    .element(tabs.getByRole('tab', { name: 'FAQ / 资源' }))
    .toHaveAttribute('aria-selected', 'true');
  await act(async () => page.getByRole('button', { name: 'How to deploy?' }).click());
  await expect.element(page.getByText('Choose hosting.')).toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'How to deploy?' }))
    .toHaveAttribute('aria-expanded', 'true');
});
test('all five account tabs stay within a narrow screen', async () => {
  await page.viewport(390, 667);
  await mount(<AccountCenterPage />, '/account?tab=orders');
  await expect.element(page.getByRole('tab', { name: '我的工单' })).toBeVisible();
  for (const tab of host.querySelectorAll('[role=tab]')) {
    const rect = tab.getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(390);
  }
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
});
test('a failed brand image keeps its footprint and falls back to initials', async () => {
  await mount(<BrandMark src="/missing-brand.png" name="Brand" />);
  const span = host.querySelector('span')!;
  await expect.poll(() => span.querySelector('img')).toBeNull();
  expect(span.textContent).toBe('B');
  expect(span.getBoundingClientRect().width).toBe(36);
});

test('a confirmed 404 is presented as unavailable with a return route', async () => {
  mocks.catalog.mockRejectedValue(new ApiError('missing', 404));
  await mount(<AppCatalogPage />, '/apps/missing');
  await expect.element(page.getByRole('alert')).toHaveTextContent('内容不存在或暂未发布');
  await expect
    .element(page.getByRole('link', { name: '返回应用中心' }))
    .toHaveAttribute('href', '/');
  expect(host.textContent).not.toContain('重新加载');
});
