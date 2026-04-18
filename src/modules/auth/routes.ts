import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import { buildEmailRateLimitKey, buildUserRateLimitKey } from '../../lib/rate-limit';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateCurrentUserSchema,
  verifyEmailSchema
} from './schemas';
import { AuthService } from './service';

function toAuthResponse(
  app: FastifyInstance,
  user: { id: string; email: string; displayName: string | null; role: 'user' | 'admin'; emailVerified: boolean }
) {
  const token = app.jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified
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
      displayName: user.displayName,
      role: user.role,
      emailVerified: user.emailVerified
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

  app.post('/v1/auth/register', {
    config: {
      rateLimit: {
        hook: 'preHandler',
        max: 8,
        timeWindow: '1 minute',
        keyGenerator: (request: Parameters<typeof buildEmailRateLimitKey>[0]) =>
          buildEmailRateLimitKey(request, 'auth-register')
      }
    }
  }, async (request, reply) => {
    const payload = registerSchema.parse(request.body);
    const user = await new AuthService(app.db, app.appEnv).register(payload);

    return reply.status(201).send(toAuthResponse(app, user));
  });

  app.post('/v1/auth/login', {
    config: {
      rateLimit: {
        hook: 'preHandler',
        max: 12,
        timeWindow: '1 minute',
        keyGenerator: (request: Parameters<typeof buildEmailRateLimitKey>[0]) =>
          buildEmailRateLimitKey(request, 'auth-login')
      }
    }
  }, async (request) => {
    const payload = loginSchema.parse(request.body);
    const user = await new AuthService(app.db, app.appEnv).login(payload);

    return toAuthResponse(app, user);
  });

  app.get('/v1/me', { preHandler: app.authenticate }, async (request) => {
    const user = await new AuthService(app.db, app.appEnv).getUserById(request.user.sub);

    return {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        emailVerified: user.emailVerified
      }
    };
  });

  app.patch('/v1/me', { preHandler: app.authenticate }, async (request) => {
    const payload = updateCurrentUserSchema.parse(request.body);
    const user = await new AuthService(app.db, app.appEnv).updateCurrentUser(request.user.sub, payload);

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        emailVerified: user.emailVerified
      }
    };
  });

  app.post('/v1/me/change-password', { preHandler: app.authenticate }, async (request) => {
    const payload = changePasswordSchema.parse(request.body);
    return new AuthService(app.db, app.appEnv).changePassword(request.user.sub, payload);
  });

  app.post('/v1/auth/verify-email', { preHandler: app.authenticate }, async (request) => {
    const payload = verifyEmailSchema.parse(request.body);
    return new AuthService(app.db, app.appEnv).verifyEmail(request.user.sub, payload.code);
  });

  app.post('/v1/auth/resend-verification', {
    preHandler: app.authenticate,
    config: {
      rateLimit: {
        hook: 'preHandler',
        max: 3,
        timeWindow: '5 minutes',
        keyGenerator: (request: Parameters<typeof buildUserRateLimitKey>[0]) =>
          buildUserRateLimitKey(request, 'auth-resend-verification')
      }
    }
  }, async (request) => {
    const service = new AuthService(app.db, app.appEnv);
    const user = await service.getUserById(request.user.sub);

    if (user.emailVerified) {
      return { alreadyVerified: true };
    }

    return service.sendVerificationCode(user.id, user.email);
  });

  app.post('/v1/auth/forgot-password', {
    config: {
      rateLimit: {
        hook: 'preHandler',
        max: 5,
        timeWindow: '10 minutes',
        keyGenerator: (request: Parameters<typeof buildEmailRateLimitKey>[0]) =>
          buildEmailRateLimitKey(request, 'auth-forgot-password')
      }
    }
  }, async (request) => {
    const payload = forgotPasswordSchema.parse(request.body);
    return new AuthService(app.db, app.appEnv).requestPasswordReset(payload.email);
  });

  app.post('/v1/auth/reset-password', {
    config: {
      rateLimit: {
        hook: 'preHandler',
        max: 8,
        timeWindow: '10 minutes',
        keyGenerator: (request: Parameters<typeof buildEmailRateLimitKey>[0]) =>
          buildEmailRateLimitKey(request, 'auth-reset-password')
      }
    }
  }, async (request) => {
    const payload = resetPasswordSchema.parse(request.body);
    return new AuthService(app.db, app.appEnv).resetPassword(payload);
  });
};
