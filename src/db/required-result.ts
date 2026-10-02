/** A write or a one-row projection that must exist must fail at its owner boundary. */
export function requireResult<T>(value: T | null | undefined, operation: string): T {
  if (value === undefined || value === null)
    throw new Error(`Missing required database result: ${operation}`);
  return value;
}
