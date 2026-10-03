import { expect, test, vi } from 'vitest';
import { handleAsync, runAsync } from './async-events';
import { toastErr } from './toast';
vi.mock('./toast', () => ({ toastErr: vi.fn() }));

test('event adapter forwards arguments synchronously and handles rejected promises', async () => {
  const error = new Error('request failed');
  const preventDefault = vi.fn();
  const action = vi.fn(async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    throw error;
  });
  expect(handleAsync(action)({ preventDefault })).toBeUndefined();
  expect(preventDefault).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(toastErr).toHaveBeenCalledWith(error));
});

test('detached UI operations also report synchronous failures', () => {
  const error = new Error('navigation failed');
  runAsync(() => {
    throw error;
  });
  expect(toastErr).toHaveBeenCalledWith(error);
});
