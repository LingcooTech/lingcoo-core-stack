import { createHmac } from 'node:crypto';
import type { DbExecutor } from '../db/types';
import { type jobRuns } from '../db/schema';
import type { AppEnv } from '../lib/env';
import { AlertingSettingsService } from '../modules/settings/public';
import { SmtpSettingsService } from '../modules/settings/public';
import { Mailer } from '../lib/mailer';
import { httpError } from '../lib/errors';
import type { MailDeliveryJobPayload } from '../modules/jobs/public';
function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export class DeliveryJobHandlers {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
  ) {}
  private async buildMailer() {
    if (!this.env) {
      return new Mailer();
    }

    const config = await new SmtpSettingsService(this.db, this.env).getRuntimeSettings();
    return new Mailer(config ? { ...config, password: config.password ?? '' } : null);
  }

  async process(job: Pick<typeof jobRuns.$inferSelect, 'kind' | 'payload'>, signal?: AbortSignal) {
    switch (job.kind) {
      case 'email.deliver': {
        const raw = normalizeObject(job.payload);
        const payload: MailDeliveryJobPayload = {
          to: normalizeString(raw.to),
          subject: normalizeString(raw.subject),
          text: normalizeString(raw.text),
          html: normalizeString(raw.html) || undefined,
        };
        const mailer = await this.buildMailer();
        if (!mailer.isConfigured) {
          throw httpError(503, 'SMTP is not configured');
        }
        await mailer.send({
          to: normalizeString(payload.to),
          subject: normalizeString(payload.subject),
          text: normalizeString(payload.text),
          html: normalizeString(payload.html) || undefined,
        });
        return {
          ok: true,
          channel: mailer.isCapture ? 'capture' : 'smtp',
          simulated: mailer.isCapture,
          to: normalizeString(payload.to).toLowerCase(),
        };
      }
      case 'alert.webhook.deliver': {
        if (!this.env) {
          throw httpError(503, 'Alerting settings are not available');
        }
        const settings = await new AlertingSettingsService(this.db, this.env).getRuntimeSettings();
        if (!settings || !settings.enabled || !settings.webhook.enabled || !settings.webhook.url) {
          throw httpError(503, 'Alert webhook is not configured');
        }
        const webhookUrl = settings.webhook.url;

        const raw = normalizeObject(job.payload);
        const body = normalizeObject(raw.body);
        const bodyText = JSON.stringify(body);
        const headers: Record<string, string> = {
          'content-type': 'application/json',
          'user-agent': 'fd-core-stack-alert-worker',
        };
        if (settings.webhook.secret) {
          headers['x-fd-alert-signature'] = createHmac('sha256', settings.webhook.secret)
            .update(bodyText)
            .digest('hex');
        }

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body: bodyText,
          signal,
        });

        if (!response.ok) {
          throw httpError(
            502,
            `Alert webhook failed with ${response.status} ${response.statusText}`,
          );
        }

        return {
          ok: true,
          channel: 'webhook',
          status: response.status,
        };
      }
      default:
        throw httpError(400, `Unsupported job kind: ${job.kind}`);
    }
  }
}
