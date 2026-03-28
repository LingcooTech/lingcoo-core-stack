import { adminModule } from './admin';
import { appModule } from './app';
import { authModule } from './auth';
import { billingModule } from './billing';
import { checkoutModule } from './checkout';
import { eventModule } from './event';
import { installModule } from './install';
import { licenseModule } from './license';
import { moduleNames } from './names';
import { systemModule } from './system';
import type { AppModule } from './types';

export const appModules: AppModule[] = [
  systemModule,
  authModule,
  adminModule,
  appModule,
  installModule,
  checkoutModule,
  billingModule,
  licenseModule,
  eventModule
];

export function getModuleNames(): string[] {
  return [...moduleNames];
}
