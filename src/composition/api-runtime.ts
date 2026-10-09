import { StorageService } from '../modules/storage/public';
import type { DbExecutor } from '../db/types';
import type { AppEnv } from '../lib/env';
import { createServiceFactories } from './service-factories';
import { AdminService } from '../modules/admin/service';
import { AiService } from '../modules/ai/service';
import { AppService } from '../modules/app/service';
import { AuthService } from '../modules/auth/service';
import { BillingService } from '../modules/billing/service';
import { CheckoutService } from '../modules/checkout/service';
import { ContentService } from '../modules/content/service';
import { DeploymentService } from '../modules/deployment/service';
import { DocsService } from '../modules/docs/service';
import { EventService } from '../modules/event/service';
import { InstallService } from '../modules/install/service';
import { LicenseService } from '../modules/license/service';
import { NotificationsService } from '../modules/notifications/service';
import { TicketService } from '../modules/ticket/service';
export function createApiServices(
  db: DbExecutor,
  env: AppEnv,
  factories = createServiceFactories(),
) {
  return {
    StorageService: new StorageService(db, env),
    AdminService: new AdminService(factories, db, env),
    AiService: new AiService(factories, db, env),
    AppService: new AppService(factories, db, env),
    AuthService: new AuthService(factories, db, env),
    BillingService: new BillingService(factories, db, env),
    CheckoutService: new CheckoutService(factories, db, env),
    ContentService: new ContentService(factories, db),
    DeploymentService: new DeploymentService(factories, db, env),
    DocsService: new DocsService(factories, db),
    EventService: new EventService(db),
    InstallService: new InstallService(factories, db),
    LicenseService: new LicenseService(factories, db),
    NotificationsService: new NotificationsService(factories, db),
    TicketService: new TicketService(factories, db),
  };
}
export type ApiServices = ReturnType<typeof createApiServices>;
