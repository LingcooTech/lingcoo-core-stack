import type { FastifyPluginAsync } from 'fastify';

import { LicenseService } from './service';

export const licenseRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/catalog', async () => {
    return new LicenseService(app.db).getCatalogSnapshot();
  });

  app.get('/v1/products', async () => {
    const { products } = await new LicenseService(app.db).getCatalogSnapshot();
    return { items: products };
  });

  app.get('/v1/plans', async () => {
    const { plans } = await new LicenseService(app.db).getCatalogSnapshot();
    return { items: plans };
  });

  app.get('/v1/features', async () => {
    const { features } = await new LicenseService(app.db).getCatalogSnapshot();
    return { items: features };
  });

  app.get('/v1/entitlements/me', { preHandler: app.authenticate }, async (request) => {
    return new LicenseService(app.db).listUserEntitlements(request.user.sub);
  });
};
