import type { FastifyRequest } from 'fastify';

export const staticAssetPrefix = '/assets/';

/** Use the matched route, never an attacker-controlled URL prefix or query string. */
export function isStaticAssetRequest(request: FastifyRequest): boolean {
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    request.routeOptions.url === `${staticAssetPrefix}*`
  );
}
