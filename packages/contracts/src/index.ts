export * from './auth.js';
export * from './billing.js';
export * from './checkout.js';
export * from './deployment.js';
export * from './delivery.js';
export * from './core-responses.js';
export * from './response-registry.js';
export function isIdempotentCommand(method: string, path: string) {
  if (method.toUpperCase() !== 'POST') return false;
  const clean = path.split('?')[0] ?? '';
  return (
    ['/v1/billing/orders', '/v1/checkout/sessions', '/v1/deployments'].includes(clean) ||
    /^\/v1\/admin\/orders\/[^/]+\/refund$/.test(clean) ||
    /^\/v1\/deployments\/[^/]+\/actions$/.test(clean)
  );
}
export * from './hosting.js';

export * from './admin-deployments.js';

export * from './hosting-service.js';
