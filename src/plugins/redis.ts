import fp from 'fastify-plugin';
import Redis from 'ioredis';

import type { AppEnv } from '../lib/env';

type RedisPluginOptions = {
  env: AppEnv;
};

export const redisPlugin = fp<RedisPluginOptions>(async (app, options) => {
  const redis = new Redis(options.env.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 2
  });

  app.decorate('redis', redis);

  app.addHook('onClose', async () => {
    await redis.quit();
  });
});
