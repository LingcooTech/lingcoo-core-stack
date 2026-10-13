import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';

import { buildUserRateLimitKey } from '../../lib/rate-limit';

export const licenseRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/v1/apps/:appCode/claim',
    {
      preHandler: app.authenticate,
      config: {
        rateLimit: {
          hook: 'preHandler',
          max: 20,
          timeWindow: '1 minute',
          keyGenerator: (request: Parameters<typeof buildUserRateLimitKey>[0]) =>
            buildUserRateLimitKey(request, 'free-claim'),
        },
      },
    },
    async (request) => {
      const { appCode } = z.object({ appCode: z.string().min(1).max(64) }).parse(request.params);
      z.object({})
        .strict()
        .parse(request.body ?? {});
      return app.services.LicenseService.claimFreeApplication(appCode, request.user.sub);
    },
  );
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
