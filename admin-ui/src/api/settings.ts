import { apiClient } from './client';
import type {
  AiChatCompletionResult,
  AiProviderListResponse,
  AiProviderModelsResponse,
  AlertingSettingsOverview,
  ContentImportNotionTestResult,
  ContentImportSettingsOverview,
  ContentImportWordPressTestResult,
  HubPageContent,
  PublicPagesSettingsOverview,
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

export interface AlertingSettingsInput {
  enabled?: boolean;
  minimumLevel?: 'info' | 'warning' | 'error';
  cooldownMinutes?: number;
  email?: {
    enabled?: boolean;
    recipients?: string[];
  };
  webhook?: {
    enabled?: boolean;
    url?: string;
    secret?: string;
  };
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

export type SiteNavigationChildInput = SiteFooterLinkInput;

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
  return apiClient('GET /v1/admin/system-settings/smtp', '/v1/admin/system-settings/smtp');
}

export async function upsertSmtpSettings(
  payload: SmtpSettingsInput,
): Promise<SmtpSettingsOverview> {
  return apiClient('PUT /v1/admin/system-settings/smtp', '/v1/admin/system-settings/smtp', {
    body: JSON.stringify(payload),
  });
}

export async function clearSmtpSettings(): Promise<void> {
  await apiClient('DELETE /v1/admin/system-settings/smtp', '/v1/admin/system-settings/smtp');
}

export async function sendSmtpTestEmail(payload: SmtpTestEmailInput): Promise<SmtpTestEmailResult> {
  return apiClient(
    'POST /v1/admin/system-settings/smtp/test',
    '/v1/admin/system-settings/smtp/test',
    { body: JSON.stringify(payload) },
  );
}

export async function getAlertingSettings(): Promise<AlertingSettingsOverview> {
  return apiClient('GET /v1/admin/system-settings/alerting', '/v1/admin/system-settings/alerting');
}

export async function upsertAlertingSettings(
  payload: AlertingSettingsInput,
): Promise<AlertingSettingsOverview> {
  return apiClient('PUT /v1/admin/system-settings/alerting', '/v1/admin/system-settings/alerting', {
    body: JSON.stringify(payload),
  });
}

export async function clearAlertingSettings(): Promise<void> {
  await apiClient(
    'DELETE /v1/admin/system-settings/alerting',
    '/v1/admin/system-settings/alerting',
  );
}

export async function getQiniuSettings(): Promise<QiniuSettingsOverview> {
  return apiClient('GET /v1/admin/system-settings/qiniu', '/v1/admin/system-settings/qiniu');
}

export async function upsertQiniuSettings(
  payload: QiniuSettingsInput,
): Promise<QiniuSettingsOverview> {
  return apiClient('PUT /v1/admin/system-settings/qiniu', '/v1/admin/system-settings/qiniu', {
    body: JSON.stringify(payload),
  });
}

export async function clearQiniuSettings(): Promise<void> {
  await apiClient('DELETE /v1/admin/system-settings/qiniu', '/v1/admin/system-settings/qiniu');
}

export async function testQiniuSettings(
  payload: QiniuSettingsInput,
): Promise<QiniuTestConnectionResult> {
  return apiClient(
    'POST /v1/admin/system-settings/qiniu/test',
    '/v1/admin/system-settings/qiniu/test',
    { body: JSON.stringify(payload) },
  );
}

export async function getSiteSettings(): Promise<SiteSettingsOverview> {
  return apiClient('GET /v1/admin/system-settings/site', '/v1/admin/system-settings/site');
}

export async function upsertSiteSettings(
  payload: SiteSettingsInput,
): Promise<SiteSettingsOverview> {
  return apiClient('PUT /v1/admin/system-settings/site', '/v1/admin/system-settings/site', {
    body: JSON.stringify(payload),
  });
}

export async function clearSiteSettings(): Promise<void> {
  await apiClient('DELETE /v1/admin/system-settings/site', '/v1/admin/system-settings/site');
}

export interface PublicPagesSettingsInput {
  contentHub?: Partial<HubPageContent>;
  docsHub?: Partial<HubPageContent>;
}

export async function getPublicPagesSettings(): Promise<PublicPagesSettingsOverview> {
  return apiClient(
    'GET /v1/admin/system-settings/public-pages',
    '/v1/admin/system-settings/public-pages',
  );
}

export async function upsertPublicPagesSettings(
  payload: PublicPagesSettingsInput,
): Promise<PublicPagesSettingsOverview> {
  return apiClient(
    'PUT /v1/admin/system-settings/public-pages',
    '/v1/admin/system-settings/public-pages',
    { body: JSON.stringify(payload) },
  );
}

export async function clearPublicPagesSettings(): Promise<void> {
  await apiClient(
    'DELETE /v1/admin/system-settings/public-pages',
    '/v1/admin/system-settings/public-pages',
  );
}

export async function getPublicSiteSettings(): Promise<PublicSiteSettings> {
  return apiClient('GET /v1/system/site-settings', '/v1/system/site-settings');
}

export async function getContentImportSettings(): Promise<ContentImportSettingsOverview> {
  return apiClient(
    'GET /v1/admin/system-settings/content-import',
    '/v1/admin/system-settings/content-import',
  );
}

export async function upsertContentImportSettings(
  payload: ContentImportSettingsInput,
): Promise<ContentImportSettingsOverview> {
  return apiClient(
    'PUT /v1/admin/system-settings/content-import',
    '/v1/admin/system-settings/content-import',
    { body: JSON.stringify(payload) },
  );
}

export async function clearContentImportSettings(): Promise<void> {
  await apiClient(
    'DELETE /v1/admin/system-settings/content-import',
    '/v1/admin/system-settings/content-import',
  );
}

export async function testWordPressImportSettings(payload: {
  siteUrl?: string;
  username?: string;
  appPassword?: string;
}): Promise<ContentImportWordPressTestResult> {
  return apiClient(
    'POST /v1/admin/system-settings/content-import/wordpress/test',
    '/v1/admin/system-settings/content-import/wordpress/test',
    { body: JSON.stringify(payload) },
  );
}

export async function testNotionImportSettings(payload: {
  apiToken?: string;
}): Promise<ContentImportNotionTestResult> {
  return apiClient(
    'POST /v1/admin/system-settings/content-import/notion/test',
    '/v1/admin/system-settings/content-import/notion/test',
    { body: JSON.stringify(payload) },
  );
}

export async function getAiProviders(): Promise<AiProviderListResponse> {
  return apiClient('GET /v1/admin/ai/providers', '/v1/admin/ai/providers');
}

export async function listAiProviderModels(
  provider: 'openrouter',
): Promise<AiProviderModelsResponse> {
  return apiClient(
    'GET /v1/admin/ai/providers/:param/models',
    `/v1/admin/ai/providers/${provider}/models`,
  );
}

export async function previewOpenRouterModels(
  payload: OpenRouterSettingsInput,
): Promise<AiProviderModelsResponse> {
  return apiClient(
    'POST /v1/admin/system-settings/ai/providers/openrouter/models',
    '/v1/admin/system-settings/ai/providers/openrouter/models',
    { body: JSON.stringify(payload) },
  );
}

export async function getOpenRouterSettings(): Promise<OpenRouterSettingsOverview> {
  return apiClient(
    'GET /v1/admin/system-settings/ai/providers/openrouter',
    '/v1/admin/system-settings/ai/providers/openrouter',
  );
}

export async function upsertOpenRouterSettings(
  payload: OpenRouterSettingsInput,
): Promise<OpenRouterSettingsOverview> {
  return apiClient(
    'PUT /v1/admin/system-settings/ai/providers/openrouter',
    '/v1/admin/system-settings/ai/providers/openrouter',
    { body: JSON.stringify(payload) },
  );
}

export async function testOpenRouterSettings(
  payload: OpenRouterSettingsInput,
): Promise<OpenRouterTestConnectionResult> {
  return apiClient(
    'POST /v1/admin/system-settings/ai/providers/openrouter/test',
    '/v1/admin/system-settings/ai/providers/openrouter/test',
    { body: JSON.stringify(payload) },
  );
}

export async function previewOpenRouterChatCompletion(
  payload: OpenRouterChatPreviewInput,
): Promise<AiChatCompletionResult> {
  return apiClient(
    'POST /v1/admin/system-settings/ai/providers/openrouter/chat/completions',
    '/v1/admin/system-settings/ai/providers/openrouter/chat/completions',
    { body: JSON.stringify(payload) },
  );
}

export async function clearOpenRouterSettings(): Promise<void> {
  await apiClient(
    'DELETE /v1/admin/system-settings/ai/providers/openrouter',
    '/v1/admin/system-settings/ai/providers/openrouter',
  );
}
