import type { FastifyRequest } from 'fastify';

type RequestShape = FastifyRequest & {
  user?: {
    sub?: string;
  };
};

function getBodyValue(request: FastifyRequest, key: string): string {
  const body =
    request.body && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : null;
  const value = body ? body[key] : '';
  return typeof value === 'string' ? value.trim() : '';
}

function getParamValue(request: FastifyRequest, key: string): string {
  const params =
    request.params && typeof request.params === 'object'
      ? (request.params as Record<string, unknown>)
      : null;
  const value = params ? params[key] : '';
  return typeof value === 'string' ? value.trim() : '';
}

export function buildEmailRateLimitKey(request: FastifyRequest, scope: string): string {
  const email = getBodyValue(request, 'email').toLowerCase() || 'unknown';
  return `ip:${request.ip}:${scope}:${email}`;
}

export function buildUserRateLimitKey(request: FastifyRequest, scope: string): string {
  const userId =
    ((request as RequestShape).user && (request as RequestShape).user?.sub) || 'anonymous';
  return `user:${userId}:${scope}`;
}

export function buildSessionRateLimitKey(
  request: FastifyRequest,
  scope: string,
  sessionParamName = 'sessionCode',
): string {
  const sessionCode = getParamValue(request, sessionParamName) || 'unknown';
  return `ip:${request.ip}:${scope}:${sessionCode}`;
}

export function buildAppCodeUserRateLimitKey(request: FastifyRequest, scope: string): string {
  const userId =
    ((request as RequestShape).user && (request as RequestShape).user?.sub) || 'anonymous';
  const appCode = getParamValue(request, 'appCode') || 'unknown-app';
  return `user:${userId}:${scope}:${appCode}`;
}
