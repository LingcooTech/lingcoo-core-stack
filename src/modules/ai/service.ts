import { queryBatch } from '../../db/query-batch';
import { pickAiDependencies, type AiDependencies } from './dependencies';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';

import { createAuthAccess } from '../auth/public';

import { getAiProviderAdapter, listAiProviders } from './providers';
import type {
  AiChatCompletionInput,
  AiChatCompletionResult,
  AiProviderCode,
  AiProviderStatus,
} from './providers/types';
import { AiRepository, type AiUsageSummary } from './repository';

type AiAccessScope = 'trial' | 'entitled';
type AiProxyOperation = 'chat' | 'translation' | 'proofreading';

type AiQuotaSpec = {
  windowHours: number;
  requestLimit: number;
  requestCharsLimit: number;
  totalTokensLimit: number;
  maxMessagesPerRequest: number;
  maxInputCharsPerRequest: number;
  maxTokensPerRequest: number;
  defaultMaxTokens: number;
};

type UserAccessState = {
  app: {
    id: string;
    code: string;
    name: string;
    type: string;
    status: string;
  };
  user: {
    id: string;
    emailVerified: boolean;
  };
  providers: AiProviderStatus[];
  configuredProviders: AiProviderStatus[];
  defaultProvider: AiProviderCode | null;
  accessScope: AiAccessScope;
  hasAnyEntitlement: boolean;
  featureCodes: string[];
  planCodes: string[];
  usageWindowStartedAt: Date;
  usage: AiUsageSummary;
  quotaSpec: AiQuotaSpec;
  status: {
    ready: boolean;
    reason: 'ready' | 'email_not_verified' | 'provider_not_configured' | 'quota_exhausted';
  };
};

const AI_PROXY_QUOTAS: Record<AiAccessScope, AiQuotaSpec> = {
  trial: {
    windowHours: 24,
    requestLimit: 30,
    requestCharsLimit: 120_000,
    totalTokensLimit: 80_000,
    maxMessagesPerRequest: 24,
    maxInputCharsPerRequest: 16_000,
    maxTokensPerRequest: 2_500,
    defaultMaxTokens: 1_800,
  },
  entitled: {
    windowHours: 24,
    requestLimit: 600,
    requestCharsLimit: 2_000_000,
    totalTokensLimit: 1_200_000,
    maxMessagesPerRequest: 64,
    maxInputCharsPerRequest: 100_000,
    maxTokensPerRequest: 8_000,
    defaultMaxTokens: 4_000,
  },
};

function normalizeCount(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

export class AiService {
  private readonly capabilities: AiDependencies;
  constructor(
    capabilities: AiDependencies,
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
  ) {
    this.capabilities = pickAiDependencies(capabilities);
  }

  private getContext() {
    return {
      db: this.db,
      env: this.env,
    };
  }

  private getQuotaSpec(scope: AiAccessScope) {
    return AI_PROXY_QUOTAS[scope];
  }

  private getUsageWindowStartedAt(windowHours: number) {
    return new Date(Date.now() - windowHours * 60 * 60 * 1000);
  }

  private getConfiguredProviders(items: AiProviderStatus[]) {
    return items.filter((item) => item.configured);
  }

  private getDefaultProvider(items: AiProviderStatus[]): AiProviderCode | null {
    return (items[0]?.code ?? null) as AiProviderCode | null;
  }

  private measureRequestChars(input: AiChatCompletionInput) {
    return input.messages.reduce((total, message) => total + message.content.trim().length, 0);
  }

  private hasQuotaRemaining(quotaSpec: AiQuotaSpec, usage: AiUsageSummary) {
    return (
      usage.requestCount < quotaSpec.requestLimit &&
      usage.requestChars < quotaSpec.requestCharsLimit &&
      usage.totalTokens < quotaSpec.totalTokensLimit
    );
  }

  private buildQuotaView(quotaSpec: AiQuotaSpec, usage: AiUsageSummary) {
    return {
      windowHours: quotaSpec.windowHours,
      requests: {
        limit: quotaSpec.requestLimit,
        used: usage.requestCount,
        remaining: Math.max(quotaSpec.requestLimit - usage.requestCount, 0),
      },
      requestChars: {
        limit: quotaSpec.requestCharsLimit,
        used: usage.requestChars,
        remaining: Math.max(quotaSpec.requestCharsLimit - usage.requestChars, 0),
      },
      totalTokens: {
        limit: quotaSpec.totalTokensLimit,
        used: usage.totalTokens,
        remaining: Math.max(quotaSpec.totalTokensLimit - usage.totalTokens, 0),
      },
      maxMessagesPerRequest: quotaSpec.maxMessagesPerRequest,
      maxInputCharsPerRequest: quotaSpec.maxInputCharsPerRequest,
      maxTokensPerRequest: quotaSpec.maxTokensPerRequest,
      defaultMaxTokens: quotaSpec.defaultMaxTokens,
    };
  }

  private async resolveUserAccessState(appCode: string, userId: string): Promise<UserAccessState> {
    const [app, user, providers] = await queryBatch(this.db, [
      () => this.capabilities.createAppService(this.db).requireActiveApp(appCode),
      () => createAuthAccess(this.db).findUserById(userId),
      () => listAiProviders(this.getContext()),
    ]);

    if (!user) {
      throw httpError(401, 'User not found');
    }

    const entitlements = await this.capabilities
      .createLicenseService(this.db)
      .listUserEntitlementsByAppId(app.id, userId);
    const featureCodes = Array.from(
      new Set(
        (entitlements.summary ?? []).flatMap((entry) =>
          Array.isArray(entry.featureCodes) ? entry.featureCodes : [],
        ),
      ),
    ).sort();
    const planCodes = Array.from(
      new Set(
        (entitlements.items ?? [])
          .map((item) => item.plan?.code ?? '')
          .filter((value) => typeof value === 'string' && value.trim().length > 0),
      ),
    ).sort();

    const accessScope: AiAccessScope = entitlements.items.length > 0 ? 'entitled' : 'trial';
    const quotaSpec = this.getQuotaSpec(accessScope);
    const usageWindowStartedAt = this.getUsageWindowStartedAt(quotaSpec.windowHours);
    const usage = await new AiRepository(this.db).summarizeUsageWindow(
      userId,
      app.id,
      usageWindowStartedAt,
    );
    const configuredProviders = this.getConfiguredProviders(providers);
    const defaultProvider = this.getDefaultProvider(configuredProviders);
    const ready =
      user.emailVerified &&
      configuredProviders.length > 0 &&
      this.hasQuotaRemaining(quotaSpec, usage);

    return {
      app: {
        id: app.id,
        code: app.code,
        name: app.name,
        type: app.type,
        status: app.status,
      },
      user: {
        id: user.id,
        emailVerified: user.emailVerified,
      },
      providers,
      configuredProviders,
      defaultProvider,
      accessScope,
      hasAnyEntitlement: entitlements.items.length > 0,
      featureCodes,
      planCodes,
      usageWindowStartedAt,
      usage,
      quotaSpec,
      status: {
        ready,
        reason: !user.emailVerified
          ? 'email_not_verified'
          : configuredProviders.length === 0
            ? 'provider_not_configured'
            : this.hasQuotaRemaining(quotaSpec, usage)
              ? 'ready'
              : 'quota_exhausted',
      },
    };
  }

  private ensureProviderAvailable(state: UserAccessState, provider: AiProviderCode) {
    const matched = state.providers.find((item) => item.code === provider);
    if (!matched) {
      throw httpError(400, `Unsupported AI provider: ${provider}`);
    }

    if (!matched.configured) {
      throw httpError(422, `${matched.label} 未配置`);
    }

    return matched;
  }

  private validateUserChatInput(state: UserAccessState, input: AiChatCompletionInput) {
    if (input.messages.length > state.quotaSpec.maxMessagesPerRequest) {
      throw httpError(422, `单次 AI 请求最多允许 ${state.quotaSpec.maxMessagesPerRequest} 条消息`);
    }

    const requestChars = this.measureRequestChars(input);
    if (requestChars <= 0) {
      throw httpError(422, 'AI 请求内容不能为空');
    }

    if (requestChars > state.quotaSpec.maxInputCharsPerRequest) {
      throw httpError(
        422,
        `单次 AI 请求内容不能超过 ${state.quotaSpec.maxInputCharsPerRequest} 个字符`,
      );
    }

    if (state.usage.requestCount >= state.quotaSpec.requestLimit) {
      throw httpError(429, 'AI 请求次数已达到当前额度上限，请稍后再试或升级套餐');
    }

    if (state.usage.requestChars + requestChars > state.quotaSpec.requestCharsLimit) {
      throw httpError(429, 'AI 文本额度已用完，请稍后再试或升级套餐');
    }

    if (
      typeof input.maxTokens === 'number' &&
      input.maxTokens > state.quotaSpec.maxTokensPerRequest
    ) {
      throw httpError(422, `maxTokens 不能超过 ${state.quotaSpec.maxTokensPerRequest}`);
    }

    const effectiveMaxTokens =
      typeof input.maxTokens === 'number' ? input.maxTokens : state.quotaSpec.defaultMaxTokens;

    if (state.usage.totalTokens + effectiveMaxTokens > state.quotaSpec.totalTokensLimit) {
      throw httpError(429, 'AI Token 额度已接近上限，请稍后再试或升级套餐');
    }

    return {
      requestChars,
      effectiveMaxTokens,
    };
  }

  private buildUserAccessResponse(state: UserAccessState) {
    return {
      app: {
        code: state.app.code,
        name: state.app.name,
        type: state.app.type,
      },
      access: {
        scope: state.accessScope,
        entitled: state.hasAnyEntitlement,
        featureCodes: state.featureCodes,
        planCodes: state.planCodes,
      },
      providers: {
        defaultProvider: state.defaultProvider,
        items: state.providers,
      },
      quota: this.buildQuotaView(state.quotaSpec, state.usage),
      usage: {
        windowStartedAt: state.usageWindowStartedAt,
        requestCount: state.usage.requestCount,
        requestChars: state.usage.requestChars,
        responseChars: state.usage.responseChars,
        promptTokens: state.usage.promptTokens,
        completionTokens: state.usage.completionTokens,
        totalTokens: state.usage.totalTokens,
      },
      status: state.status,
      user: {
        emailVerified: state.user.emailVerified,
      },
    };
  }

  async listProviders() {
    return {
      items: await listAiProviders(this.getContext()),
    };
  }

  async listProviderModels(provider: AiProviderCode) {
    return {
      provider,
      items: await getAiProviderAdapter(provider).listModels(this.getContext()),
    };
  }

  async createChatCompletion(provider: AiProviderCode, input: AiChatCompletionInput) {
    return getAiProviderAdapter(provider).createChatCompletion(this.getContext(), input);
  }

  async getUserAccessOverview(appCode: string, userId: string) {
    const state = await this.resolveUserAccessState(appCode, userId);
    return this.buildUserAccessResponse(state);
  }

  async listUserProviders(appCode: string, userId: string) {
    const state = await this.resolveUserAccessState(appCode, userId);
    return {
      app: {
        code: state.app.code,
        name: state.app.name,
      },
      defaultProvider: state.defaultProvider,
      items: state.providers,
      access: {
        scope: state.accessScope,
        entitled: state.hasAnyEntitlement,
      },
    };
  }

  async listUserProviderModels(appCode: string, userId: string, provider: AiProviderCode) {
    const state = await this.resolveUserAccessState(appCode, userId);
    this.ensureProviderAvailable(state, provider);

    return {
      app: {
        code: state.app.code,
        name: state.app.name,
      },
      provider,
      items: await getAiProviderAdapter(provider).listModels(this.getContext()),
      access: {
        scope: state.accessScope,
        entitled: state.hasAnyEntitlement,
      },
    };
  }

  async createUserChatCompletion(
    appCode: string,
    userId: string,
    provider: AiProviderCode,
    input: AiChatCompletionInput & { operation?: AiProxyOperation },
  ): Promise<
    AiChatCompletionResult & {
      access: ReturnType<AiService['buildUserAccessResponse']>;
    }
  > {
    const operation = input.operation ?? 'chat';
    const requestedModel = input.model?.trim() || '';
    // Reserve quota in a short transaction. The remote request runs after the lock is released.
    const { state, requestChars, effectiveMaxTokens, reservation } = await this.db.transaction(
      async (tx) => {
        const repository = new AiRepository(tx);
        await repository.lockQuota(userId, appCode);
        const service = new AiService(this.capabilities, tx, this.env);
        const state = await service.resolveUserAccessState(appCode, userId);
        service.ensureProviderAvailable(state, provider);
        if (!state.user.emailVerified) throw httpError(403, 'Please verify your email address');
        const budget = service.validateUserChatInput(state, input);
        const reservation = await repository.createUsageEvent({
          userId,
          appId: state.app.id,
          provider,
          model: requestedModel || 'default',
          operation,
          accessScope: state.accessScope,
          status: 'pending',
          requestChars: budget.requestChars,
          responseChars: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: budget.effectiveMaxTokens,
          meta: { appCode, state: 'reserved' },
        });
        return { state, ...budget, reservation };
      },
    );
    let providerCompleted = false;
    try {
      const result = await getAiProviderAdapter(provider).createChatCompletion(this.getContext(), {
        ...input,
        maxTokens: effectiveMaxTokens,
      });

      providerCompleted = true;
      const promptTokens = normalizeCount(result.usage.promptTokens);
      const completionTokens = normalizeCount(result.usage.completionTokens);
      const totalTokens =
        normalizeCount(result.usage.totalTokens) || Math.max(promptTokens + completionTokens, 0);
      const responseChars = result.content.length;

      await this.db.transaction(async (tx) => {
        await new AiRepository(tx).finishUsageEvent(reservation.id, {
          model: result.model,
          status: 'succeeded',
          responseChars,
          promptTokens,
          completionTokens,
          totalTokens,
          meta: {
            appCode: state.app.code,
            finishReason: result.finishReason,
            requestedModel: requestedModel || null,
            messageCount: input.messages.length,
            responseId: result.meta.id,
          },
        });

        await this.capabilities.createEventService(tx).capture({
          userId,
          appId: state.app.id,
          eventName: 'ai.proxy.chat_completed',
          properties: {
            appCode: state.app.code,
            provider,
            model: result.model,
            operation,
            accessScope: state.accessScope,
            requestChars,
            responseChars,
            totalTokens,
          },
        });
      });

      const nextState: UserAccessState = {
        ...state,
        usage: {
          requestCount: state.usage.requestCount + 1,
          requestChars: state.usage.requestChars + requestChars,
          responseChars: state.usage.responseChars + responseChars,
          promptTokens: state.usage.promptTokens + promptTokens,
          completionTokens: state.usage.completionTokens + completionTokens,
          totalTokens: state.usage.totalTokens + totalTokens,
        },
        status: {
          ready: true,
          reason: 'ready',
        },
      };

      nextState.status.ready =
        state.user.emailVerified &&
        state.configuredProviders.length > 0 &&
        this.hasQuotaRemaining(state.quotaSpec, nextState.usage);
      nextState.status.reason = !nextState.status.ready ? 'quota_exhausted' : 'ready';

      return {
        ...result,
        access: this.buildUserAccessResponse(nextState),
      };
    } catch (error) {
      if (providerCompleted) throw error;
      await this.db.transaction(async (tx) => {
        await new AiRepository(tx).finishUsageEvent(reservation.id, {
          model: requestedModel || 'default',
          status: 'failed',
          responseChars: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          meta: {
            appCode: state.app.code,
            message: error instanceof Error ? error.message : 'Unknown AI proxy error',
            requestedModel: requestedModel || null,
            messageCount: input.messages.length,
          },
        });

        await this.capabilities.createEventService(tx).capture({
          userId,
          appId: state.app.id,
          eventName: 'ai.proxy.chat_failed',
          properties: {
            appCode: state.app.code,
            provider,
            model: requestedModel || null,
            operation,
            accessScope: state.accessScope,
            requestChars,
            error: error instanceof Error ? error.message : 'Unknown AI proxy error',
          },
        });
      });
      throw error;
    }
  }
}
