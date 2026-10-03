import { httpError } from '../../lib/errors';
import type { DeploymentDependencies } from './dependencies';
import type { DeploymentRepository } from './repository';
export type DeploymentEntitlementAccess = Pick<
  ReturnType<DeploymentDependencies['createLicenseAccess']>,
  'findEntitlementById' | 'getPlanById'
>;
export function isEffectiveEntitlement(entitlement: { status: string; expiresAt: Date | null }) {
  return (
    entitlement.status === 'active' &&
    (!entitlement.expiresAt || entitlement.expiresAt.getTime() >= Date.now())
  );
}
export async function loadDeploymentEntitlement(
  repository: DeploymentEntitlementAccess,
  deployment: NonNullable<Awaited<ReturnType<DeploymentRepository['findDeploymentById']>>>,
) {
  if (!deployment?.entitlementId) {
    throw httpError(
      409,
      'Deployment is not bound to an entitlement. Create a new deployment with an active entitlement.',
    );
  }

  const entitlement = await repository.findEntitlementById(deployment.entitlementId);
  if (
    !entitlement ||
    entitlement.userId !== deployment.userId ||
    entitlement.appId !== deployment.appId
  ) {
    throw httpError(409, 'Deployment entitlement is missing or no longer matches this deployment.');
  }
  if (!isEffectiveEntitlement(entitlement)) {
    throw httpError(403, 'Deployment entitlement is not active. Restore access before continuing.');
  }
  const plan = await repository.getPlanById(entitlement.planId);
  if (!plan) {
    throw httpError(500, 'Deployment entitlement is missing related plan');
  }

  return { entitlement, plan };
}
