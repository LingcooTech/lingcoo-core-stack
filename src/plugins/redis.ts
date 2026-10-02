import fp from 'fastify-plugin';
import { createRedis } from '../composition/connections';

import type { AppEnv } from '../lib/env';

type RedisPluginOptions = {
  env: AppEnv;
};

export const redisPlugin = fp<RedisPluginOptions>(async (app, options) => {
  const redis = createRedis(options.env);

  app.decorate('redis', redis);

  app.addHook('onClose', async () => {
    redis.disconnect();
  });
});
