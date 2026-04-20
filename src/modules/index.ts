import { adminModule } from './admin';
import { aiModule } from './ai';
import { appModule } from './app';
import { authModule } from './auth';
import { billingModule } from './billing';
import { checkoutModule } from './checkout';
import { contentModule } from './content';
import { deploymentModule } from './deployment';
import { docsModule } from './docs';
import { eventModule } from './event';
import { installModule } from './install';
import { licenseModule } from './license';
import { moduleNames } from './names';
import { notificationsModule } from './notifications';
import { systemModule } from './system';
import { ticketModule } from './ticket';
import type { AppModule } from './types';

export const appModules: AppModule[] = [
  systemModule,
  authModule,
  adminModule,
  aiModule,
  appModule,
  contentModule,
  docsModule,
  notificationsModule,
  ticketModule,
  installModule,
  deploymentModule,
  checkoutModule,
  billingModule,
  licenseModule,
  eventModule
];

export function getModuleNames(): string[] {
  return [...moduleNames];
}
