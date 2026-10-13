import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { AppCatalogPage } from './AppCatalogPage';
const mocks = vi.hoisted(() => ({ catalog: vi.fn(), claim: vi.fn(), owned: vi.fn() }));
vi.mock('@/api/apps', () => ({ getAppCatalog: mocks.catalog, claimFreeApp: mocks.claim }));
vi.mock('@/api/user', () => ({ listMyEntitlements: mocks.owned }));
vi.mock('@/lib/use-page-metadata', () => ({ usePageMetadata: () => undefined }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ isAuthenticated: true }) }));
for (const mode of ['none', 'one_click'])
  test(`free ${mode} claim displays price, prevents repeated clicks and navigates to delivery`, async () => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    mocks.catalog.mockResolvedValue({
      app: {
        id: 'free',
        code: 'free',
        name: 'Free application',
        status: 'active',
        type: 'web_app',
        meta: { acquisition: 'free', deliveryMode: mode },
        links: [],
        highlights: [],
        screenshots: [],
        faq: [],
        checkoutOffers: [],
        content: '',
        description: '',
        createdAt: new Date().toISOString(),
      },
      offers: [],
      plans: [],
      features: [],
      planFeatures: [],
    });
    mocks.owned.mockResolvedValue({ items: [] });
    let resolveClaim!: () => void;
    mocks.claim.mockReset();
    mocks.claim.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveClaim = resolve;
        }),
    );
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host),
      client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      await act(async () =>
        root.render(
          <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={['/apps/free']}>
              <Routes>
                <Route path="/apps/:appCode" element={<AppCatalogPage />} />
                <Route path="/deploy" element={<div>Deployment destination</div>} />
                <Route path="/account" element={<div>Account destination</div>} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>,
        ),
      );
      await expect.poll(() => host.textContent).toContain('免费领取');
      expect(host.textContent).toContain('托管服务单独计费');
      const button = Array.from(host.querySelectorAll('button')).find(
        (b) => b.textContent === '免费领取',
      )!;
      await act(async () => button.click());
      await expect.poll(() => button.disabled).toBe(true);
      expect(mocks.claim).toHaveBeenCalledTimes(1);
      expect(mocks.claim).toHaveBeenCalledWith('free');
      await act(async () => resolveClaim());
      await expect
        .poll(() => host.textContent)
        .toContain(mode === 'one_click' ? 'Deployment destination' : 'Account destination');
    } finally {
      await act(async () => root.unmount());
      client.clear();
      host.remove();
    }
  });
