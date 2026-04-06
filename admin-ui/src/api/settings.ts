import { apiClient } from './client';
import type {
  QiniuSettingsOverview,
  QiniuTestConnectionResult,
  SmtpSettingsOverview,
  SmtpTestEmailResult
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

export async function getSmtpSettings(): Promise<SmtpSettingsOverview> {
  return apiClient<SmtpSettingsOverview>('/v1/admin/system-settings/smtp');
}

export async function upsertSmtpSettings(payload: SmtpSettingsInput): Promise<SmtpSettingsOverview> {
  return apiClient<SmtpSettingsOverview>('/v1/admin/system-settings/smtp', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function clearSmtpSettings(): Promise<void> {
  await apiClient('/v1/admin/system-settings/smtp', { method: 'DELETE' });
}

export async function sendSmtpTestEmail(payload: SmtpTestEmailInput): Promise<SmtpTestEmailResult> {
  return apiClient<SmtpTestEmailResult>('/v1/admin/system-settings/smtp/test', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getQiniuSettings(): Promise<QiniuSettingsOverview> {
  return apiClient<QiniuSettingsOverview>('/v1/admin/system-settings/qiniu');
}

export async function upsertQiniuSettings(payload: QiniuSettingsInput): Promise<QiniuSettingsOverview> {
  return apiClient<QiniuSettingsOverview>('/v1/admin/system-settings/qiniu', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function clearQiniuSettings(): Promise<void> {
  await apiClient('/v1/admin/system-settings/qiniu', { method: 'DELETE' });
}

export async function testQiniuSettings(payload: QiniuSettingsInput): Promise<QiniuTestConnectionResult> {
  return apiClient<QiniuTestConnectionResult>('/v1/admin/system-settings/qiniu/test', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
