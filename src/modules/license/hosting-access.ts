import type { DbExecutor } from '../../db/types';
import { LicenseRepository } from './repository';
export function hostingLicenseAccess(db: DbExecutor) {
  const repository = new LicenseRepository(db);
  return {
    find: (id: string) => repository.findEntitlementById(id),
    lock: (id: string) => repository.lockEntitlementById(id),
    source: (id: string) => repository.listEntitlementsBySource('order', id),
    plan: (id: string) => repository.getPlanById(id),
  };
}
