import { apiClient } from './client';
import type { SmtpSettingsOverview, SmtpTestEmailResult } from './types';

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
