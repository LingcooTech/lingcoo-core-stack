import type { EventServiceFactory } from '../event/public';

export interface LicenseDependencies {
  readonly createEventService: (
    ...args: Parameters<EventServiceFactory>
  ) => Pick<ReturnType<EventServiceFactory>, 'capture'>;
  readonly now: () => Date;
}
export function pickLicenseDependencies(input: LicenseDependencies): LicenseDependencies {
  return {
    createEventService: (...args) => {
      const port = input.createEventService(...args);
      return { capture: port.capture.bind(port) };
    },
    now: input.now,
  };
}
