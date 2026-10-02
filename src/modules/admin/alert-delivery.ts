import type { DbExecutor } from '../../db/types';
import { AlertingSettingsService, type AlertLevel } from '../settings/public';
import type { AppEnv } from '../../lib/env';
import { buildMailDedupeKey, JobRunService } from '../../lib/job-runs';
import type { AdminService } from './service';

const levelRank: Record<AlertLevel, number> = {
  info: 0,
  warning: 1,
  error: 2,
};

type ObservabilityAlert = NonNullable<
  Awaited<ReturnType<AdminService['getObservabilitySummary']>>['alerts'][number]
>;

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildFingerprint(alerts: Array<{ id: string; count: number }>) {
  return alerts
    .map((alert) => `${alert.id}:${alert.count}`)
    .sort()
    .join('|');
}

function buildMailContent(input: {
  appName: string;
  generatedAt: string;
  alerts: Array<{ level: string; title: string; description: string; count: number; href: string }>;
}) {
  const title = `${input.appName} 告警摘要`;
  const lines = [
    title,
    `生成时间: ${input.generatedAt}`,
    '',
    ...input.alerts.flatMap((alert) => [
      `[${alert.level}] ${alert.title} (${alert.count})`,
      alert.description,
      `路径: ${alert.href}`,
      '',
    ]),
  ];
  const htmlItems = input.alerts
    .map(
      (alert) => `
        <li>
          <strong>[${escapeHtml(alert.level)}] ${escapeHtml(alert.title)}</strong>
          <div>${escapeHtml(alert.description)}</div>
          <div>路径: ${escapeHtml(alert.href)}</div>
        </li>
      `,
    )
    .join('');

  return {
    subject: `[${input.appName}] ${input.alerts.length} 个活跃告警`,
    text: lines.join('\n'),
    html: `<h2>${escapeHtml(title)}</h2><p>生成时间: ${escapeHtml(input.generatedAt)}</p><ul>${htmlItems}</ul>`,
  };
}

export class AlertDeliveryService {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
    private readonly loadSummary: () => ReturnType<AdminService['getObservabilitySummary']>,
  ) {}

  async dispatchActiveAlerts(options: { traceId?: string } = {}) {
    const settings = await new AlertingSettingsService(this.db, this.env).getRuntimeSettings();
    if (!settings?.enabled) {
      return { dispatched: 0, channels: [], alerts: 0 };
    }

    const summary = await this.loadSummary();
    const alerts = summary.alerts
      .filter((alert): alert is ObservabilityAlert => Boolean(alert))
      .filter((alert) => levelRank[alert.level] >= levelRank[settings.minimumLevel]);

    if (alerts.length === 0) {
      return { dispatched: 0, channels: [], alerts: 0 };
    }

    const now = new Date();
    const generatedAt = now.toISOString();
    const cooldownMs = settings.cooldownMinutes * 60_000;
    const cooldownBucket = Math.floor(now.getTime() / cooldownMs);
    const fingerprint = buildFingerprint(alerts);
    const appName = this.env.APP_NAME || 'FD Core Stack';
    const jobs = new JobRunService(this.db, this.env);
    const channels: string[] = [];
    let dispatched = 0;

    const mailContent = buildMailContent({ appName, generatedAt, alerts });
    if (settings.email.enabled && settings.email.recipients.length > 0) {
      for (const recipient of settings.email.recipients) {
        await jobs.enqueueMail(
          {
            to: recipient,
            subject: mailContent.subject,
            text: mailContent.text,
            html: mailContent.html,
          },
          {
            scope: 'observability.alert',
            reference: `${fingerprint}:${cooldownBucket}`,
            relatedEntityType: 'observability_alert',
            relatedEntityId: 'active',
            traceId: options.traceId,
          },
        );
        dispatched += 1;
      }
      channels.push('email');
    }

    if (settings.webhook.enabled && settings.webhook.url) {
      await jobs.enqueueAlertWebhook(
        {
          body: {
            appName,
            generatedAt,
            alerts,
            metrics: summary.metrics,
          },
        },
        {
          dedupeKey: buildMailDedupeKey({
            scope: 'observability.alert.webhook',
            recipient: settings.webhook.url,
            subject: fingerprint,
            reference: String(cooldownBucket),
          }),
          traceId: options.traceId,
          meta: {
            alertCount: alerts.length,
            minimumLevel: settings.minimumLevel,
          },
        },
      );
      dispatched += 1;
      channels.push('webhook');
    }

    return { dispatched, channels, alerts: alerts.length };
  }
}
