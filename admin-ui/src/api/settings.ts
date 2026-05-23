import { apiClient } from './client';
import type {
  AiChatCompletionResult,
  AiProviderListResponse,
  AiProviderModelsResponse,
  ContentImportNotionTestResult,
  ContentImportSettingsOverview,
  ContentImportWordPressTestResult,
  PublicSiteSettings,
  QiniuSettingsOverview,
  QiniuTestConnectionResult,
  OpenRouterSettingsOverview,
  OpenRouterTestConnectionResult,
  SiteSettingsOverview,
  SmtpSettingsOverview,
  SmtpTestEmailResult,
} from './types';

export interface SmtpSettingsInput {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  password?: string;
  from?: string;
}

export interface SmtpTestEmailInput extends SmtpSettingsInput {
  to: string;
  subject: string;
  text: string;
}

export interface QiniuSettingsInput {
  accessKey?: string;
  secretKey?: string;
  bucketName?: string;
  publicBaseUrl?: string;
  uploadHost?: string;
  defaultPrefix?: string;
}

export interface SiteFooterLinkInput {
  label: string;
  url: string;
  openInNewTab?: boolean;
}

export interface SiteNavigationChildInput extends SiteFooterLinkInput {}

export interface SiteNavigationItemInput {
  label: string;
  url?: string;
  openInNewTab?: boolean;
  children?: SiteNavigationChildInput[];
}

export interface SiteSettingsInput {
  siteName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  brandPrimaryColor?: string;
  headerNavigation?: SiteNavigationItemInput[];
  footerCopyright?: string;
  filingInfo?: string;
  footerLinks?: SiteFooterLinkInput[];
}

export interface OpenRouterSettingsInput {
  apiKey?: string;
  baseUrl?: string;
  siteUrl?: string;
  siteName?: string;
  defaultModel?: string;
}

export interface OpenRouterChatPreviewInput extends OpenRouterSettingsInput {
  model?: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;
}

export interface ContentImportSettingsInput {
  wordpress?: {
    siteUrl?: string;
    username?: string;
    appPassword?: string;
  };
  notion?: {
    apiToken?: string;
  };
}

export async function getSmtpSettings(): Promise<SmtpSettingsOverview> {
  return apiClient<SmtpSettingsOverview>('/v1/admin/system-settings/smtp');
}

export async function upsertSmtpSettings(
  payload: SmtpSettingsInput,
): Promise<SmtpSettingsOverview> {
  return apiClient<SmtpSettingsOverview>('/v1/admin/system-settings/smtp', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function clearSmtpSettings(): Promise<void> {
  await apiClient('/v1/admin/system-settings/smtp', { method: 'DELETE' });
}

export async function sendSmtpTestEmail(payload: SmtpTestEmailInput): Promise<SmtpTestEmailResult> {
  return apiClient<SmtpTestEmailResult>('/v1/admin/system-settings/smtp/test', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getQiniuSettings(): Promise<QiniuSettingsOverview> {
  return apiClient<QiniuSettingsOverview>('/v1/admin/system-settings/qiniu');
}

export async function upsertQiniuSettings(
  payload: QiniuSettingsInput,
): Promise<QiniuSettingsOverview> {
  return apiClient<QiniuSettingsOverview>('/v1/admin/system-settings/qiniu', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function clearQiniuSettings(): Promise<void> {
  await apiClient('/v1/admin/system-settings/qiniu', { method: 'DELETE' });
}

export async function testQiniuSettings(
  payload: QiniuSettingsInput,
): Promise<QiniuTestConnectionResult> {
  return apiClient<QiniuTestConnectionResult>('/v1/admin/system-settings/qiniu/test', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getSiteSettings(): Promise<SiteSettingsOverview> {
  return apiClient<SiteSettingsOverview>('/v1/admin/system-settings/site');
}

export async function upsertSiteSettings(
  payload: SiteSettingsInput,
): Promise<SiteSettingsOverview> {
  return apiClient<SiteSettingsOverview>('/v1/admin/system-settings/site', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function clearSiteSettings(): Promise<void> {
  await apiClient('/v1/admin/system-settings/site', { method: 'DELETE' });
}

export async function getPublicSiteSettings(): Promise<PublicSiteSettings> {
  return apiClient<PublicSiteSettings>('/v1/system/site-settings');
}

export async function getContentImportSettings(): Promise<ContentImportSettingsOverview> {
  return apiClient<ContentImportSettingsOverview>('/v1/admin/system-settings/content-import');
}

export async function upsertContentImportSettings(
  payload: ContentImportSettingsInput,
): Promise<ContentImportSettingsOverview> {
  return apiClient<ContentImportSettingsOverview>('/v1/admin/system-settings/content-import', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function clearContentImportSettings(): Promise<void> {
  await apiClient('/v1/admin/system-settings/content-import', { method: 'DELETE' });
}

export async function testWordPressImportSettings(payload: {
  siteUrl?: string;
  username?: string;
  appPassword?: string;
}): Promise<ContentImportWordPressTestResult> {
  return apiClient<ContentImportWordPressTestResult>(
    '/v1/admin/system-settings/content-import/wordpress/test',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function testNotionImportSettings(payload: {
  apiToken?: string;
}): Promise<ContentImportNotionTestResult> {
  return apiClient<ContentImportNotionTestResult>(
    '/v1/admin/system-settings/content-import/notion/test',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function getAiProviders(): Promise<AiProviderListResponse> {
  return apiClient<AiProviderListResponse>('/v1/admin/ai/providers');
}

export async function listAiProviderModels(
  provider: 'openrouter',
): Promise<AiProviderModelsResponse> {
  return apiClient<AiProviderModelsResponse>(`/v1/admin/ai/providers/${provider}/models`);
}

export async function previewOpenRouterModels(
  payload: OpenRouterSettingsInput,
): Promise<AiProviderModelsResponse> {
  return apiClient<AiProviderModelsResponse>(
    '/v1/admin/system-settings/ai/providers/openrouter/models',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function getOpenRouterSettings(): Promise<OpenRouterSettingsOverview> {
  return apiClient<OpenRouterSettingsOverview>('/v1/admin/system-settings/ai/providers/openrouter');
}

export async function upsertOpenRouterSettings(
  payload: OpenRouterSettingsInput,
): Promise<OpenRouterSettingsOverview> {
  return apiClient<OpenRouterSettingsOverview>(
    '/v1/admin/system-settings/ai/providers/openrouter',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );
}

export async function testOpenRouterSettings(
  payload: OpenRouterSettingsInput,
): Promise<OpenRouterTestConnectionResult> {
  return apiClient<OpenRouterTestConnectionResult>(
    '/v1/admin/system-settings/ai/providers/openrouter/test',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function previewOpenRouterChatCompletion(
  payload: OpenRouterChatPreviewInput,
): Promise<AiChatCompletionResult> {
  return apiClient<AiChatCompletionResult>(
    '/v1/admin/system-settings/ai/providers/openrouter/chat/completions',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function clearOpenRouterSettings(): Promise<void> {
  await apiClient('/v1/admin/system-settings/ai/providers/openrouter', { method: 'DELETE' });
}
