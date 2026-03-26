import { authModule } from './auth';
import { billingModule } from './billing';
import { eventModule } from './event';
import { licenseModule } from './license';
import { moduleNames } from './names';
import { systemModule } from './system';
import type { AppModule } from './types';

export const appModules: AppModule[] = [
  systemModule,
  authModule,
  billingModule,
  licenseModule,
  eventModule
];

export function getModuleNames(): string[] {
  return [...moduleNames];
}
