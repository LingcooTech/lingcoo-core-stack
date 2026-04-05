import type { FastifyPluginAsync } from 'fastify';

import { buildUserRateLimitKey } from '../../lib/rate-limit';
import { LicenseService } from './service';

export const licenseRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/catalog', async () => {
    return new LicenseService(app.db).getCatalogSnapshot();
  });

  app.get('/v1/plans', async () => {
    const { plans } = await new LicenseService(app.db).getCatalogSnapshot();
    return { items: plans };
  });

  app.get('/v1/features', async () => {
    const { features } = await new LicenseService(app.db).getCatalogSnapshot();
    return { items: features };
  });

  app.get('/v1/entitlements/me', {
    preHandler: app.authenticate,
    config: {
      rateLimit: {
        hook: 'preHandler',
        max: 120,
        timeWindow: '1 minute',
        keyGenerator: (request: Parameters<typeof buildUserRateLimitKey>[0]) =>
          buildUserRateLimitKey(request, 'entitlements-me')
      }
    }
  }, async (request) => {
    return new LicenseService(app.db).listUserEntitlements(request.user.sub);
  });
};
