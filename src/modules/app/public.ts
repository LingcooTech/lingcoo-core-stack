import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import type { AppService } from './service';
import { AppRepository } from './repository';
import { AppLifecycleRepository } from './lifecycle-repository';
import { applicationReleaseSchema } from '@lingcoo/contracts';
import { httpError } from '../../lib/errors';
export { rotateApplicationConnectionKeys } from './key-rotation';
export { compileComposePlan, materializeComposePlan, type ComposePlan } from './compose-plan';
export { composeManifest } from './delivery-view';

/** Deployment owns the instance; app owns and validates the immutable release snapshot. */
export async function readPublishedComposeRelease(
  db: DbExecutor,
  appId: string,
  releaseId: string,
) {
  const row = await new AppLifecycleRepository(db).release(appId, releaseId);
  if (!row || row.status !== 'published') throw httpError(422, 'Published release required');
  return applicationReleaseSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
  });
}

export type AppServicePort = Pick<
  AppService,
  | 'getPublicApp'
  | 'listUserEntitlementsForApp'
  | 'requireActiveApp'
  | 'requireActiveSecretById'
  | 'resolveCheckoutOffer'
>;
export type AppServiceFactory = (db: DbExecutor, env?: AppEnv) => AppServicePort;

export function createAppAccess(db: DbExecutor) {
  const implementation = new AppRepository(db);
  return {
    findAppByCode: implementation.findAppByCode.bind(implementation),
    findAppById: implementation.findAppById.bind(implementation),
    listAppsByIds: implementation.listAppsByIds.bind(implementation),
  };
}
export type AppRepositoryPort = ReturnType<typeof createAppAccess>;
