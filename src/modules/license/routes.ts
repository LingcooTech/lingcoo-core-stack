import type { FastifyPluginAsync } from 'fastify';

import { buildUserRateLimitKey } from '../../lib/rate-limit';
import { LicenseService } from './service';

export const licenseRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/catalog', async () => {
    return new LicenseService(app.db).getCatalogSnapshot();
  });

  app.get('/v1/products', async () => {
    const { products } = await new LicenseService(app.db).getCatalogSnapshot();
    return { items: products };
  });

  app.get('/v1/prices', async () => {
    const { prices } = await new LicenseService(app.db).getCatalogSnapshot();
    return { items: prices };
  });

  app.get('/v1/authorization-templates', async () => {
    const { authorizationTemplates } = await new LicenseService(app.db).getCatalogSnapshot();
    return { items: authorizationTemplates };
  });

  app.get('/v1/checkout-offers', async () => {
    const { checkoutOffers } = await new LicenseService(app.db).getCatalogSnapshot();
    return { items: checkoutOffers };
  });

  app.get(
    '/v1/authorizations/me',
    {
      preHandler: app.authenticate,
      config: {
        rateLimit: {
          hook: 'preHandler',
          max: 120,
          timeWindow: '1 minute',
          keyGenerator: (request: Parameters<typeof buildUserRateLimitKey>[0]) =>
            buildUserRateLimitKey(request, 'authorizations-me')
        }
      }
    },
    async (request) => {
      return new LicenseService(app.db).listUserAuthorizations(request.user.sub);
    }
  );
};
