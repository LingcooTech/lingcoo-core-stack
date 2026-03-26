import { desc } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import { entitlements, features, plans, products } from '../../db/schema';

export const licenseRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/products', async () => {
    const items = await app.db.select().from(products).orderBy(desc(products.createdAt)).limit(50);

    return {
      items
    };
  });

  app.get('/v1/plans', async () => {
    const items = await app.db.select().from(plans).orderBy(desc(plans.createdAt)).limit(100);

    return {
      items
    };
  });

  app.get('/v1/features', async () => {
    const items = await app.db.select().from(features).orderBy(desc(features.createdAt)).limit(200);

    return {
      items
    };
  });

  app.get('/v1/entitlements', async () => {
    const items = await app.db.select().from(entitlements).orderBy(desc(entitlements.createdAt)).limit(200);

    return {
      items
    };
  });
};
