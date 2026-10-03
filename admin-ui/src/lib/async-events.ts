import { toastErr } from './toast';

/** React/DOM event dispatchers do not observe rejected promises. */
export function handleAsync<Args extends unknown[]>(
  action: (...args: Args) => unknown,
): (...args: Args) => void {
  return (...args) => {
    try {
      Promise.resolve(action(...args)).catch((error: unknown) => {
        toastErr(error);
      });
    } catch (error) {
      toastErr(error);
    }
  };
}

export function runAsync(action: () => unknown): void {
  handleAsync(action)();
}
