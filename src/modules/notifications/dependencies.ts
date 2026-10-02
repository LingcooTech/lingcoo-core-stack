export interface NotificationsDependencies {
  readonly now: () => Date;
}
export function pickNotificationsDependencies(
  input: NotificationsDependencies,
): NotificationsDependencies {
  return {
    now: input.now,
  };
}
