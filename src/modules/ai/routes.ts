import type { FastifyPluginAsync } from 'fastify';

import { buildAppCodeUserRateLimitKey } from '../../lib/rate-limit';
import { OpenRouterSettingsService } from '../../lib/openrouter-settings';
import { AiService } from './service';
import {
  aiAppCodeParamsSchema,
  aiAppProviderParamsSchema,
  aiChatCompletionSchema,
  aiProviderParamsSchema,
  aiProxyChatCompletionSchema,
  openrouterPreviewChatSchema,
  openrouterSettingsSchema
} from './schemas';

export const aiRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/apps/:appCode/ai/access', {
    preHandler: app.authenticate,
    config: {
      rateLimit: {
        hook: 'preHandler',
        max: 120,
        timeWindow: '1 minute',
        keyGenerator: (request: Parameters<typeof buildAppCodeUserRateLimitKey>[0]) =>
          buildAppCodeUserRateLimitKey(request, 'app-ai-access')
      }
    }
  }, async (request) => {
    const { appCode } = aiAppCodeParamsSchema.parse(request.params);

    return new AiService(app.db, app.appEnv).getUserAccessOverview(appCode, request.user.sub);
  });

  app.get('/v1/apps/:appCode/ai/providers', {
    preHandler: app.requireEmailVerified,
    config: {
      rateLimit: {
        hook: 'preHandler',
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: (request: Parameters<typeof buildAppCodeUserRateLimitKey>[0]) =>
          buildAppCodeUserRateLimitKey(request, 'app-ai-providers')
      }
    }
  }, async (request) => {
    const { appCode } = aiAppCodeParamsSchema.parse(request.params);

    return new AiService(app.db, app.appEnv).listUserProviders(appCode, request.user.sub);
  });

  app.get('/v1/apps/:appCode/ai/providers/:provider/models', {
    preHandler: app.requireEmailVerified,
    config: {
      rateLimit: {
        hook: 'preHandler',
        max: 30,
        timeWindow: '1 minute',
        keyGenerator: (request: Parameters<typeof buildAppCodeUserRateLimitKey>[0]) =>
          buildAppCodeUserRateLimitKey(request, 'app-ai-models')
      }
    }
  }, async (request) => {
    const params = aiAppProviderParamsSchema.parse(request.params);
    return new AiService(app.db, app.appEnv).listUserProviderModels(params.appCode, request.user.sub, params.provider);
  });

  app.post('/v1/apps/:appCode/ai/providers/:provider/chat/completions', {
    preHandler: app.requireEmailVerified,
    config: {
      rateLimit: {
        hook: 'preHandler',
        max: 20,
        timeWindow: '1 minute',
        keyGenerator: (request: Parameters<typeof buildAppCodeUserRateLimitKey>[0]) =>
          buildAppCodeUserRateLimitKey(request, 'app-ai-chat')
      }
    }
  }, async (request) => {
    const params = aiAppProviderParamsSchema.parse(request.params);
    const payload = aiProxyChatCompletionSchema.parse(request.body);

    return new AiService(app.db, app.appEnv).createUserChatCompletion(
      params.appCode,
      request.user.sub,
      params.provider,
      payload
    );
  });

  app.get('/v1/admin/ai/providers', { preHandler: app.requireAdmin }, async () => {
    return new AiService(app.db, app.appEnv).listProviders();
  });

  app.get('/v1/admin/ai/providers/:provider/models', { preHandler: app.requireAdmin }, async (request) => {
    const params = aiProviderParamsSchema.parse(request.params);
    return new AiService(app.db, app.appEnv).listProviderModels(params.provider);
  });

  app.post('/v1/admin/ai/providers/:provider/chat/completions', { preHandler: app.requireAdmin }, async (request) => {
    const params = aiProviderParamsSchema.parse(request.params);
    const payload = aiChatCompletionSchema.parse(request.body);
    return new AiService(app.db, app.appEnv).createChatCompletion(params.provider, payload);
  });

  app.get('/v1/admin/system-settings/ai/providers/openrouter', { preHandler: app.requireAdmin }, async () => {
    return new OpenRouterSettingsService(app.db, app.appEnv).getOverview();
  });

  app.put('/v1/admin/system-settings/ai/providers/openrouter', { preHandler: app.requireAdmin }, async (request) => {
    const payload = openrouterSettingsSchema.parse(request.body);
    return new OpenRouterSettingsService(app.db, app.appEnv).upsertSettings(payload, request.user.sub);
  });

  app.post('/v1/admin/system-settings/ai/providers/openrouter/test', { preHandler: app.requireAdmin }, async (request) => {
    const payload = openrouterSettingsSchema.parse(request.body);
    return new OpenRouterSettingsService(app.db, app.appEnv).testConnection(payload);
  });

  app.post('/v1/admin/system-settings/ai/providers/openrouter/models', { preHandler: app.requireAdmin }, async (request) => {
    const payload = openrouterSettingsSchema.parse(request.body);
    const items = await new OpenRouterSettingsService(app.db, app.appEnv).listModels(payload);
    return {
      provider: 'openrouter' as const,
      items
    };
  });

  app.post('/v1/admin/system-settings/ai/providers/openrouter/chat/completions', { preHandler: app.requireAdmin }, async (request) => {
    const payload = openrouterPreviewChatSchema.parse(request.body);
    return new OpenRouterSettingsService(app.db, app.appEnv).createChatCompletion(
      {
        model: payload.model,
        messages: payload.messages,
        temperature: payload.temperature,
        maxTokens: payload.maxTokens
      },
      {
        apiKey: payload.apiKey,
        baseUrl: payload.baseUrl,
        siteUrl: payload.siteUrl,
        siteName: payload.siteName,
        defaultModel: payload.defaultModel
      }
    );
  });

  app.delete('/v1/admin/system-settings/ai/providers/openrouter', { preHandler: app.requireAdmin }, async () => {
    await new OpenRouterSettingsService(app.db, app.appEnv).clearSettings();
    return { ok: true };
  });
};
