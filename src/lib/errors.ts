export function httpError(
  statusCode: number,
  message: string,
  details?: unknown
): Error & { statusCode: number; details?: unknown } {
  return Object.assign(new Error(message), { statusCode, details });
}
