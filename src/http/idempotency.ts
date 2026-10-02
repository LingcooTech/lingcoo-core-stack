import type { FastifyInstance } from 'fastify';
import { isIdempotentCommand, responseSchemaFor, isNonJsonResponseRoute } from '@lingcoo/contracts';
import { IdempotencyService } from '../modules/idempotency/public';
import { httpError } from '../lib/errors';
export function registerRequestContracts(app: FastifyInstance) {
  const requests = new IdempotencyService(app.db, app.appEnv);
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (
        method !== 'HEAD' &&
        route.url.startsWith('/v1/') &&
        !responseSchemaFor(method, route.url) &&
        !isNonJsonResponseRoute(method, route.url)
      )
        throw new Error(`Missing response contract: ${method} ${route.url}`);
    }
    if (typeof route.method !== 'string' || !isIdempotentCommand(route.method, route.url)) return;
    const before = route.preHandler
      ? Array.isArray(route.preHandler)
        ? route.preHandler
        : [route.preHandler]
      : [];
    route.preHandler = [
      ...before,
      async (request, reply) => {
        const key = request.headers['idempotency-key'];
        if (key === undefined) return;
        if (typeof key !== 'string') throw httpError(400, 'Invalid Idempotency-Key');
        const outcome = await requests.begin({
          principal: request.user.sub,
          command: `${request.method}:${request.routeOptions.url}`,
          key,
          payload: { params: request.params, query: request.query, body: request.body },
        });
        if (outcome.kind === 'replay')
          return reply
            .status(outcome.status)
            .header('idempotency-replayed', 'true')
            .send(outcome.body);
        request.idempotencyClaim = outcome;
      },
    ];
  });
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    if (
      typeof payload !== 'string' ||
      !reply.getHeader('content-type')?.toString().includes('application/json')
    )
      return payload;
    const data = JSON.parse(payload);
    if (reply.statusCode < 400) {
      const schema = responseSchemaFor(request.method, request.url);
      const parsed = schema?.safeParse(data);
      if (parsed && !parsed.success) {
        request.log.error(
          { issues: parsed.error.issues.map(({ path, code }) => ({ path, code })) },
          'Response contract violation',
        );
        throw httpError(500, 'Response contract violation');
      }
    } else if (data && typeof data === 'object' && typeof data.error === 'string') {
      data.code ??= `HTTP_${reply.statusCode}`;
      data.requestId = request.id;
      payload = JSON.stringify(data);
    }
    if (request.idempotencyClaim) {
      try {
        await requests.finish(request.idempotencyClaim, reply.statusCode, data);
      } catch {
        request.log.error(
          { commandId: request.idempotencyClaim.id },
          'Request outcome persistence failed',
        );
      }
    }
    return payload;
  });
}
