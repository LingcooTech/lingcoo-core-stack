import { eq } from 'drizzle-orm';

import { systemSettings } from '../db/schema';
import type { DbClient } from '../db/types';
import type { AppEnv } from './env';
import { httpError } from './errors';
import { decryptJson, encryptJson } from './settings-crypto';

export type OpenRouterSettingsSource = 'database' | 'env' | 'none';

export type OpenRouterSettings = {
  apiKey: string;
  baseUrl: string;
  siteUrl: string;
  siteName: string;
  defaultModel: string;
};

export type OpenRouterSettingsOverview = {
  configured: boolean;
  source: OpenRouterSettingsSource;
  values: {
    baseUrl: string;
    siteUrl: string;
    siteName: string;
    defaultModel: string;
  };
  secrets: {
    apiKey: {
      configured: boolean;
    };
  };
};

export type OpenRouterModelSummary = {
  id: string;
  name: string;
  description: string | null;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  promptPricing: string | null;
  completionPricing: string | null;
  modality: string | null;
  inputModalities: string[];
  outputModalities: string[];
};

export type OpenRouterChatCompletionResult = {
  provider: 'openrouter';
  model: string;
  content: string;
  finishReason: string | null;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
  meta: {
    id: string | null;
    created: number | null;
  };
};

const OPENROUTER_SETTING_KEY = 'ai.provider.openrouter';
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeUrl(value: unknown, fallback = '') {
  const raw = normalizeString(value);
  if (!raw) {
    return fallback;
  }

  try {
    const url = new URL(raw);
    return url.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeString(item))
    .filter(Boolean);
}

function normalizeOpenRouterBaseUrl(value: unknown, fallback = DEFAULT_BASE_URL) {
  const normalized = normalizeUrl(value, fallback) || fallback;

  try {
    const url = new URL(normalized);
    if (url.hostname === 'openrouter.ai' && (!url.pathname || url.pathname === '/')) {
      return DEFAULT_BASE_URL;
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

function normalizeInteger(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function hasSecret(value: string | undefined) {
  return Boolean(value?.trim());
}

export class OpenRouterSettingsService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv
  ) {}

  private getEncryptionSecret() {
    return normalizeString(this.env.SETTINGS_ENCRYPTION_KEY) || this.env.JWT_SECRET;
  }

  private getDefaultSiteUrl() {
    return normalizeUrl(this.env.PUBLIC_BASE_URL, '');
  }

  private getDefaultSiteName() {
    return normalizeString(this.env.APP_NAME) || 'fd-core-stack';
  }

  private async findSettingRow() {
    const [row] = await this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, OPENROUTER_SETTING_KEY))
      .limit(1);

    return row ?? null;
  }

  private decodeSetting<T>(row: NonNullable<Awaited<ReturnType<OpenRouterSettingsService['findSettingRow']>>>) {
    if (row.isEncrypted) {
      return decryptJson<T>(row.value, this.getEncryptionSecret());
    }

    return row.value as T;
  }

  private normalizeSettings(value: unknown): OpenRouterSettings | null {
    const raw = normalizeObject(value);
    const apiKey = normalizeString(raw.apiKey);
    const baseUrl = normalizeOpenRouterBaseUrl(raw.baseUrl, DEFAULT_BASE_URL) || DEFAULT_BASE_URL;
    const siteUrl = normalizeUrl(raw.siteUrl, this.getDefaultSiteUrl());
    const siteName = normalizeString(raw.siteName) || this.getDefaultSiteName();
    const defaultModel = normalizeString(raw.defaultModel);

    if (!apiKey && !defaultModel && !siteUrl && !siteName && !baseUrl) {
      return null;
    }

    return {
      apiKey,
      baseUrl,
      siteUrl,
      siteName,
      defaultModel
    };
  }

  async getDatabaseSettings() {
    const row = await this.findSettingRow();
    return row ? this.normalizeSettings(this.decodeSetting<unknown>(row)) : null;
  }

  getEnvSettings(): OpenRouterSettings | null {
    const apiKey = normalizeString(this.env.OPENROUTER_API_KEY);
    const baseUrl = normalizeOpenRouterBaseUrl(this.env.OPENROUTER_BASE_URL, DEFAULT_BASE_URL) || DEFAULT_BASE_URL;
    const siteUrl = normalizeUrl(this.env.OPENROUTER_SITE_URL, this.getDefaultSiteUrl());
    const siteName = normalizeString(this.env.OPENROUTER_SITE_NAME) || this.getDefaultSiteName();
    const defaultModel = normalizeString(this.env.OPENROUTER_DEFAULT_MODEL);

    if (!apiKey && !defaultModel && !siteUrl && !siteName) {
      return null;
    }

    return {
      apiKey,
      baseUrl,
      siteUrl,
      siteName,
      defaultModel
    };
  }

  async getRuntimeSettings(): Promise<OpenRouterSettings | null> {
    return (await this.getDatabaseSettings()) ?? this.getEnvSettings();
  }

  async resolveDraftSettings(
    input: {
      apiKey?: string;
      baseUrl?: string;
      siteUrl?: string;
      siteName?: string;
      defaultModel?: string;
    } = {}
  ): Promise<OpenRouterSettings> {
    const existing = (await this.getDatabaseSettings()) ?? this.getEnvSettings();

    return {
      apiKey: normalizeString(input.apiKey) || existing?.apiKey || '',
      baseUrl: normalizeOpenRouterBaseUrl(input.baseUrl, existing?.baseUrl ?? DEFAULT_BASE_URL) || DEFAULT_BASE_URL,
      siteUrl: normalizeUrl(input.siteUrl, existing?.siteUrl ?? this.getDefaultSiteUrl()),
      siteName: normalizeString(input.siteName) || existing?.siteName || this.getDefaultSiteName(),
      defaultModel: normalizeString(input.defaultModel) || existing?.defaultModel || ''
    };
  }

  private async resolveRequiredSettings(
    input?: {
      apiKey?: string;
      baseUrl?: string;
      siteUrl?: string;
      siteName?: string;
      defaultModel?: string;
    }
  ) {
    const settings = input ? await this.resolveDraftSettings(input) : await this.getRuntimeSettings();

    if (!settings?.apiKey) {
      throw httpError(422, 'OpenRouter API Key 未配置');
    }

    return settings;
  }

  async getOverview(): Promise<OpenRouterSettingsOverview> {
    const databaseSettings = await this.getDatabaseSettings();
    const envSettings = this.getEnvSettings();
    const effective = databaseSettings ?? envSettings;
    const source: OpenRouterSettingsSource = databaseSettings ? 'database' : envSettings ? 'env' : 'none';

    return {
      configured: Boolean(effective?.apiKey),
      source,
      values: {
        baseUrl: effective?.baseUrl ?? DEFAULT_BASE_URL,
        siteUrl: effective?.siteUrl ?? this.getDefaultSiteUrl(),
        siteName: effective?.siteName ?? this.getDefaultSiteName(),
        defaultModel: effective?.defaultModel ?? ''
      },
      secrets: {
        apiKey: {
          configured: hasSecret(effective?.apiKey)
        }
      }
    };
  }

  async upsertSettings(
    input: {
      apiKey?: string;
      baseUrl?: string;
      siteUrl?: string;
      siteName?: string;
      defaultModel?: string;
    },
    updatedByUserId: string
  ) {
    const next = await this.resolveDraftSettings(input);
    const now = new Date();

    await this.db
      .insert(systemSettings)
      .values({
        key: OPENROUTER_SETTING_KEY,
        value: encryptJson(next, this.getEncryptionSecret()),
        isEncrypted: true,
        updatedByUserId,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: encryptJson(next, this.getEncryptionSecret()),
          isEncrypted: true,
          updatedByUserId,
          updatedAt: now
        }
      });

    return this.getOverview();
  }

  async clearSettings() {
    await this.db.delete(systemSettings).where(eq(systemSettings.key, OPENROUTER_SETTING_KEY));
  }

  private async requestJson<T>(
    settings: OpenRouterSettings,
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(new URL(path, `${settings.baseUrl.replace(/\/+$/, '')}/`), {
      ...init,
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        ...(settings.siteUrl ? { 'HTTP-Referer': settings.siteUrl } : {}),
        ...(settings.siteName ? { 'X-Title': settings.siteName } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers as Record<string, string> | undefined)
      },
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      let message = `OpenRouter 请求失败 (${response.status})`;
      try {
        const payload = (await response.clone().json()) as { error?: { message?: string } };
        message = payload.error?.message ?? message;
      } catch {
        const detail = (await response.text()).trim();
        if (detail) {
          message = detail;
        }
      }
      throw httpError(502, message);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      const detail = (await response.text()).trim();
      const hint = 'OpenRouter 返回了非 JSON 响应，请确认 Base URL 使用 API 地址，例如 https://openrouter.ai/api/v1';
      throw httpError(502, detail && !detail.startsWith('<!DOCTYPE') ? `${hint}。${detail}` : hint);
    }

    return response.json() as Promise<T>;
  }

  async listModels(
    input?: {
      apiKey?: string;
      baseUrl?: string;
      siteUrl?: string;
      siteName?: string;
      defaultModel?: string;
    }
  ) {
    const settings = await this.resolveRequiredSettings(input);
    const payload = await this.requestJson<{
      data?: Array<{
        id?: string;
        name?: string;
        description?: string;
        context_length?: number;
        architecture?: {
          modality?: string;
          input_modalities?: string[];
          output_modalities?: string[];
        };
        top_provider?: { max_completion_tokens?: number };
        pricing?: { prompt?: string; completion?: string };
      }>;
    }>(settings, '/models');

    return (payload.data ?? [])
      .map((item): OpenRouterModelSummary | null => {
        const id = normalizeString(item.id);
        if (!id) {
          return null;
        }

        return {
          id,
          name: normalizeString(item.name) || id,
          description: normalizeString(item.description) || null,
          contextLength: normalizeInteger(item.context_length),
          maxCompletionTokens: normalizeInteger(item.top_provider?.max_completion_tokens),
          promptPricing: normalizeString(item.pricing?.prompt) || null,
          completionPricing: normalizeString(item.pricing?.completion) || null,
          modality: normalizeString(item.architecture?.modality) || null,
          inputModalities: normalizeStringArray(item.architecture?.input_modalities),
          outputModalities: normalizeStringArray(item.architecture?.output_modalities)
        };
      })
      .filter((item): item is OpenRouterModelSummary => Boolean(item))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async testConnection(
    input: {
      apiKey?: string;
      baseUrl?: string;
      siteUrl?: string;
      siteName?: string;
      defaultModel?: string;
    } = {}
  ) {
    const settings = await this.resolveRequiredSettings(input);
    const models = await this.listModels(input);

    return {
      ok: true,
      provider: 'openrouter' as const,
      modelCount: models.length,
      defaultModel: settings.defaultModel || '',
      sampleModels: models.slice(0, 8).map((item) => item.id)
    };
  }

  async createChatCompletion(
    input: {
      model?: string;
      messages: Array<{
        role: 'system' | 'user' | 'assistant' | 'tool';
        content: string;
      }>;
      temperature?: number;
      maxTokens?: number;
    },
    settingsInput?: {
      apiKey?: string;
      baseUrl?: string;
      siteUrl?: string;
      siteName?: string;
      defaultModel?: string;
    }
  ): Promise<OpenRouterChatCompletionResult> {
    const settings = await this.resolveRequiredSettings(settingsInput);
    const model = normalizeString(input.model) || settings.defaultModel;

    if (!model) {
      throw httpError(422, '未指定模型，且 OpenRouter 默认模型未配置');
    }

    const payload = await this.requestJson<{
      id?: string;
      created?: number;
      model?: string;
      choices?: Array<{
        finish_reason?: string;
        message?: {
          content?: string;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    }>(settings, '/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages: input.messages,
        ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
        ...(typeof input.maxTokens === 'number' ? { max_tokens: input.maxTokens } : {})
      })
    });

    const choice = payload.choices?.[0];
    const content = normalizeString(choice?.message?.content);

    if (!content) {
      throw httpError(502, 'OpenRouter 未返回可用内容');
    }

    return {
      provider: 'openrouter',
      model: normalizeString(payload.model) || model,
      content,
      finishReason: normalizeString(choice?.finish_reason) || null,
      usage: {
        promptTokens: normalizeInteger(payload.usage?.prompt_tokens),
        completionTokens: normalizeInteger(payload.usage?.completion_tokens),
        totalTokens: normalizeInteger(payload.usage?.total_tokens)
      },
      meta: {
        id: normalizeString(payload.id) || null,
        created: normalizeInteger(payload.created)
      }
    };
  }
}
