import { expect, test, vi } from 'vitest';
import { lazyRoute, preloadRouteElements } from './lazy-route';

test('matched shell and protected page imports start together and unrelated routes stay unloaded', async () => {
  const shellLoad = vi.fn(() => new Promise<{ default: () => null }>(() => {}));
  const pageLoad = vi.fn(() => new Promise<{ default: () => null }>(() => {}));
  const otherLoad = vi.fn(async () => ({ default: () => null }));
  const Shell = lazyRoute(shellLoad);
  const Page = lazyRoute(pageLoad);
  const Other = lazyRoute(otherLoad);
  const unused = <Other />;
  expect(unused).toBeTruthy();
  preloadRouteElements([
    <Shell />,
    <div>
      <Page />
    </div>,
  ]);
  expect(shellLoad).toHaveBeenCalledTimes(1);
  expect(pageLoad).toHaveBeenCalledTimes(1);
  expect(otherLoad).not.toHaveBeenCalled();
  preloadRouteElements([<Shell />, <Page />]);
  expect(shellLoad).toHaveBeenCalledTimes(1);
  expect(pageLoad).toHaveBeenCalledTimes(1);
});

test('preload failures remain available to React without unhandled rejection or retry loops', async () => {
  const load = vi.fn(() => Promise.reject(new Error('offline')));
  const Page = lazyRoute(load);
  preloadRouteElements([<Page />]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  preloadRouteElements([<Page />]);
  expect(load).toHaveBeenCalledTimes(1);
});
