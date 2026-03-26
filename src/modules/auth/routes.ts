import type { FastifyPluginAsync } from 'fastify';

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/auth/providers', async () => {
    return {
      items: [
        {
          code: 'password',
          enabled: false
        },
        {
          code: 'wechat-oauth',
          enabled: false
        }
      ]
    };
  });

  app.get('/v1/me', async () => {
    return {
      authenticated: false,
      user: null,
      message: 'Auth module scaffolded. Session provider not integrated yet.'
    };
  });
};
