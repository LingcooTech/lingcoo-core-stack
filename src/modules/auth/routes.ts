import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import { loginSchema, registerSchema } from './schemas';
import { AuthService } from './service';

function toAuthResponse(app: FastifyInstance, user: { id: string; email: string; displayName: string | null }) {
  const token = app.jwt.sign(
    {
      sub: user.id,
      role: 'user'
    },
    {
      expiresIn: '7d'
    }
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName
    }
  };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/auth/providers', async () => {
    return {
      items: [
        {
          code: 'password',
          enabled: true
        },
        {
          code: 'wechat-oauth',
          enabled: false
        }
      ]
    };
  });

  app.post('/v1/auth/register', async (request, reply) => {
    const payload = registerSchema.parse(request.body);
    const user = await new AuthService(app.db).register(payload);

    return reply.status(201).send(toAuthResponse(app, user));
  });

  app.post('/v1/auth/login', async (request) => {
    const payload = loginSchema.parse(request.body);
    const user = await new AuthService(app.db).login(payload);

    return toAuthResponse(app, user);
  });

  app.get('/v1/me', { preHandler: app.authenticate }, async (request) => {
    const user = await new AuthService(app.db).getUserById(request.user.sub);

    return {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName
      }
    };
  });
};
