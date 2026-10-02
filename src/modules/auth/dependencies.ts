import type { EventServiceFactory } from '../event/public';

export interface AuthDependencies {
  readonly createEventService: (
    ...args: Parameters<EventServiceFactory>
  ) => Pick<ReturnType<EventServiceFactory>, 'capture'>;
}
export function pickAuthDependencies(input: AuthDependencies): AuthDependencies {
  return {
    createEventService: (...args) => {
      const port = input.createEventService(...args);
      return { capture: port.capture.bind(port) };
    },
  };
}
