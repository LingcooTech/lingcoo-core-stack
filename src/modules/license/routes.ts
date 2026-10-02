import type { FastifyPluginAsync } from 'fastify';

import { buildUserRateLimitKey } from '../../lib/rate-limit';

export const licenseRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/catalog', async () => {
    return app.services.LicenseService.getCatalogSnapshot();
  });

  app.get('/v1/plans', async () => {
    const { plans } = await app.services.LicenseService.getCatalogSnapshot();
    return { items: plans };
  });

  app.get('/v1/features', async () => {
    const { features } = await app.services.LicenseService.getCatalogSnapshot();
    return { items: features };
  });

  app.get(
    '/v1/entitlements/me',
    {
      preHandler: app.authenticate,
      config: {
        rateLimit: {
          hook: 'preHandler',
          max: 120,
          timeWindow: '1 minute',
          keyGenerator: (request: Parameters<typeof buildUserRateLimitKey>[0]) =>
            buildUserRateLimitKey(request, 'entitlements-me'),
        },
      },
    },
    async (request) => {
      return app.services.LicenseService.listUserEntitlements(request.user.sub);
    },
  );
};
