import {
  CustomDomainService,
  HostingDnsService,
  HostingMonitor,
} from '../modules/deployment/public';
import type { AppEnv } from '../lib/env';
import { AuditLogService } from '../lib/audit-logs';
import { JobRunService } from '../modules/jobs/service';
import { JobHandlerRegistry } from '../modules/jobs/public';
import { AdminService } from '../modules/admin/service';
import { AlertDeliveryService } from '../modules/admin/alert-delivery';
import { createDatabase, createRedis } from './connections';
import { createServiceFactories } from './service-factories';
import { DeliveryJobHandlers } from './delivery-job-handlers';
export function createWorkerRuntime(env: AppEnv, factories = createServiceFactories()) {
  const { pool, db } = createDatabase(env),
    redis = createRedis(env);
  const delivery = new DeliveryJobHandlers(db, env);
  const registry = new JobHandlerRegistry()
    .register('email.deliver', (payload, { signal }) =>
      delivery.process({ kind: 'email.deliver', payload }, signal),
    )
    .register('alert.webhook.deliver', (payload, { signal }) =>
      delivery.process({ kind: 'alert.webhook.deliver', payload }, signal),
    )
    .register('notifications.project', async (payload) => {
      const events = await factories
        .createEventService(db)
        .loadProjectionEvents(payload.eventIds as string[]);
      await factories.createNotificationsService(db).projectFromEvents(
        events.map((event) => ({
          ...event,
          properties: event.properties as Record<string, unknown>,
        })),
      );
      return { projected: events.length };
    })
    .register('billing.item-refund.reconcile', async (payload) => {
      const result = await factories
        .createBillingService(db, env)
        .reconcileItemRefund(String(payload.orderNo), String(payload.refundId), true);
      return { orderNo: result.orderNo };
    })
    .register('billing.refund.reconcile', async (payload) => {
      const result = await factories
        .createBillingService(db, env)
        .reconcileRefundByOrderNo(String(payload.orderNo), { forJob: true });
      return { changed: result.changed, status: result.action.status };
    });
  return {
    pool,
    db,
    redis,
    registry,
    customDomains: new CustomDomainService(db, env),
    hostingDns: new HostingDnsService(db, env),
    jobs: new JobRunService(db, env),
    audits: new AuditLogService(db),
    alertDelivery: new AlertDeliveryService(
      db,
      env,
      () => new AdminService(factories, db, env).getObservabilitySummary(),
      () =>
        new HostingMonitor(db).reconcile().catch(() => {
          console.error('[worker] hosting monitor failed');
        }),
    ),
  };
}
