import type { EventServiceFactory } from '../event/public';

export interface ContentDependencies {
  readonly createEventService: (
    ...args: Parameters<EventServiceFactory>
  ) => Pick<ReturnType<EventServiceFactory>, 'capture'>;
  readonly now: () => Date;
}
export function pickContentDependencies(input: ContentDependencies): ContentDependencies {
  return {
    createEventService: (...args) => {
      const port = input.createEventService(...args);
      return { capture: port.capture.bind(port) };
    },
    now: input.now,
  };
}
