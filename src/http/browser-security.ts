import type { FastifyRequest } from 'fastify';
import type { AppEnv } from '../lib/env';
import { httpError } from '../lib/errors';

export function requireBrowserOrigin(request: FastifyRequest, env: AppEnv) {
  if (request.headers['sec-fetch-site'] === 'cross-site')
    throw httpError(403, 'Cross-site session request is forbidden');
  const origin = request.headers.origin;
  if (!origin) return;
  const origins = new Set([
    new URL(env.PUBLIC_BASE_URL).origin,
    ...env.CORS_ORIGIN.split(',').map((v) => v.trim()),
  ]);
  try {
    const parsed = new URL(origin);
    const sameHost =
      parsed.host === request.host &&
      (parsed.protocol === 'https:' || env.NODE_ENV !== 'production');
    if (parsed.origin !== origin || (!origins.has(origin) && !sameHost))
      throw new Error('Untrusted origin');
  } catch {
    throw httpError(403, 'Untrusted browser origin');
  }
}
