import { queryBatch } from '../../db/query-batch';
import { inArray } from 'drizzle-orm';
import { composePlanSchema } from '@lingcoo/contracts';
import { deploymentComposeRequests } from '../../db/schema';
import { composeManifest } from '../app/public';
import { type DeploymentDependencies } from './dependencies';

import type { DbExecutor } from '../../db/types';

import { getDomainBindingValue } from '../../lib/deployment-policy';

import { createAppAccess } from '../app/public';
import { createAuthAccess } from '../auth/public';

import { DeploymentRepository } from './repository';
import {
  type DeploymentAppRecord,
  type DeploymentActionKind,
  normalizeString,
} from './configuration-model';
import type { DeploymentConfigurationUseCases } from './configuration';
interface DeploymentProjectionContext {
  db: DbExecutor;
  publicBaseUrl: string;
  capabilities: {
    createLicenseAccess: (
      ...args: Parameters<DeploymentDependencies['createLicenseAccess']>
    ) => Pick<
      ReturnType<DeploymentDependencies['createLicenseAccess']>,
      'listEntitlementsByIds' | 'listPlansByIds'
    >;
  };
  readManifest: DeploymentConfigurationUseCases['readManifest'];
  readDeploymentInputValues: DeploymentConfigurationUseCases['readDeploymentInputValues'];
  filterDomainValuesForManifest: DeploymentConfigurationUseCases['filterDomainValuesForManifest'];
  readDeploymentDomainValues: DeploymentConfigurationUseCases['readDeploymentDomainValues'];
  readDeploymentInputSecrets: DeploymentConfigurationUseCases['readDeploymentInputSecrets'];
  readDeploymentRuntimeUpdatePolicy: DeploymentConfigurationUseCases['readDeploymentRuntimeUpdatePolicy'];
  normalizeMeta: DeploymentConfigurationUseCases['normalizeMeta'];
  readEntitlementDeploymentPolicy: DeploymentConfigurationUseCases['readEntitlementDeploymentPolicy'];
  readEntitlementBinding: DeploymentConfigurationUseCases['readEntitlementBinding'];
  getSourceFieldValue: DeploymentConfigurationUseCases['getSourceFieldValue'];
  buildDeploymentDisplayEnvDefaults: DeploymentConfigurationUseCases['buildDeploymentDisplayEnvDefaults'];
}
export async function hydrateDeploymentViews(
  rows: Awaited<ReturnType<DeploymentRepository['listDeploymentsByUserId']>>,
  context: DeploymentProjectionContext,
) {
  const appIds = [...new Set(rows.map((item) => item.appId))];
  const userIds = [...new Set(rows.map((item) => item.userId))];
  const entitlementIds = [
    ...new Set(
      rows.map((item) => item.entitlementId).filter((item): item is string => Boolean(item)),
    ),
  ];
  const [apps, users, tokens, entitlements, requests] = await queryBatch(context.db, [
    () => createAppAccess(context.db).listAppsByIds(appIds),
    () => createAuthAccess(context.db).listUsersByIds(userIds),
    () =>
      new DeploymentRepository(context.db).listTokensByDeploymentIds(rows.map((item) => item.id)),
    () =>
      context.capabilities.createLicenseAccess(context.db).listEntitlementsByIds(entitlementIds),
    () =>
      context.db
        .select({
          id: deploymentComposeRequests.deploymentId,
          plan: deploymentComposeRequests.plan,
        })
        .from(deploymentComposeRequests)
        .where(
          inArray(
            deploymentComposeRequests.deploymentId,
            rows.map((row) => row.id),
          ),
        ),
  ]);

  const appMap = new Map(apps.map((item) => [item.id, item]));
  const requestMap = new Map(requests.map((item) => [item.id, item.plan]));
  const userMap = new Map(users.map((item) => [item.id, item]));
  const entitlementMap = new Map(entitlements.map((item) => [item.id, item]));
  const planIds = [...new Set(entitlements.map((item) => item.planId))];
  const plans = await context.capabilities.createLicenseAccess(context.db).listPlansByIds(planIds);
  const planMap = new Map(plans.map((item) => [item.id, item]));
  const latestTokenMap = new Map<string, (typeof tokens)[number]>();
  for (const token of tokens) {
    if (!latestTokenMap.has(token.deploymentId)) {
      latestTokenMap.set(token.deploymentId, token);
    }
  }

  return queryBatch(
    context.db,
    rows.map((row) => async () => {
      const originalApp = appMap.get(row.appId) ?? null;
      const pinnedPlan = requestMap.get(row.id);
      const app =
        originalApp && pinnedPlan
          ? {
              ...originalApp,
              meta: {
                ...context.normalizeMeta(originalApp.meta),
                deliveryManifest: composeManifest(
                  composePlanSchema.parse(pinnedPlan),
                  context.publicBaseUrl,
                ),
              },
            }
          : originalApp;
      const user = userMap.get(row.userId) ?? null;
      const token = latestTokenMap.get(row.id) ?? null;
      const entitlement = row.entitlementId
        ? (entitlementMap.get(row.entitlementId) ?? null)
        : null;
      const plan = entitlement ? (planMap.get(entitlement.planId) ?? null) : null;
      const manifest = app ? context.readManifest(app as DeploymentAppRecord) : null;
      const deliveryValues = context.readDeploymentInputValues(row);
      const domainValues = context.filterDomainValuesForManifest(
        manifest,
        context.readDeploymentDomainValues(row),
      );
      const configuredSecretKeys = Object.keys(context.readDeploymentInputSecrets(row));
      const updatePolicy = context.readDeploymentRuntimeUpdatePolicy(row);
      const meta = context.normalizeMeta(row.meta);
      const runtimeAssetsMeta = context.normalizeMeta(meta.runtimeAssetsUpdate);
      const policy = entitlement ? context.readEntitlementDeploymentPolicy(entitlement) : null;
      const binding = context.readEntitlementBinding(entitlement);
      const activeBindingSource =
        policy?.domainBindingMode === 'lock_on_first_success' ? policy.domainBindingSource : 'none';
      const currentBoundValue =
        activeBindingSource === 'none'
          ? null
          : getDomainBindingValue(
              context.getSourceFieldValue(row, activeBindingSource),
              policy?.domainBindingScope ?? 'registrable_domain',
            ) || null;
      const isDomainLocked =
        activeBindingSource !== 'none' &&
        Boolean(binding.boundDomain) &&
        currentBoundValue === binding.boundDomain;
      const reportedCurrentRuntimeAssets = context.normalizeMeta(runtimeAssetsMeta.current);
      const reportedAvailableRuntimeAssets = context.normalizeMeta(runtimeAssetsMeta.available);
      const runtimeAssetLabels = new Map(
        (manifest?.assets ?? [])
          .filter((asset) => asset.type === 'docker_image')
          .map((asset) => [asset.key, asset.label]),
      );
      const runtimeAssetKeys = [
        ...new Set([
          ...Object.keys(reportedCurrentRuntimeAssets),
          ...Object.keys(reportedAvailableRuntimeAssets),
        ]),
      ];
      const runtimeAssets = runtimeAssetKeys.map((key) => ({
        key,
        label: runtimeAssetLabels.get(key) ?? key,
        current: normalizeString(reportedCurrentRuntimeAssets[key]) || null,
        available: normalizeString(reportedAvailableRuntimeAssets[key]) || null,
      }));
      const pendingAction = context.normalizeMeta(meta.pendingAction);
      const lastAction = context.normalizeMeta(meta.lastAction);

      const publicRow = { ...row };
      const { hostingNodeId: _nodeId, hostingResources: _resources, ...visibleRow } = publicRow;
      return {
        ...visibleRow,
        meta: Object.fromEntries(
          Object.entries(meta).filter(([key]) => key !== 'hostingExecution'),
        ),
        deploymentMode: row.deploymentMode as 'self_hosted' | 'managed',
        serverHost: row.deploymentMode === 'managed' ? null : row.serverHost,
        managed:
          row.deploymentMode === 'managed'
            ? {
                prefix: row.hostedPrefix!,
                hostname: row.hostedDomain!,
                state: row.hostingState as
                  | 'waiting_capacity'
                  | 'pending_infrastructure'
                  | 'deploying'
                  | 'runtime_ready'
                  | 'pending_tls'
                  | 'ready'
                  | 'failed'
                  | 'cancelled',
                nodeAssigned: Boolean(row.hostingNodeId),
                accessUrl: row.hostingState === 'ready' ? `https://${row.hostedDomain}` : null,
              }
            : null,
        deliveryValues,
        domainValues,
        configuredSecretKeys,
        updatePolicy,
        runtimeAssets,
        runtimeAssetsOfferedAt: normalizeString(runtimeAssetsMeta.offeredAt) || null,
        runtimeAssetsAppliedAt: normalizeString(runtimeAssetsMeta.appliedAt) || null,
        pendingAction:
          normalizeString(pendingAction.id).length > 0
            ? {
                id: normalizeString(pendingAction.id),
                kind: normalizeString(pendingAction.kind) as DeploymentActionKind,
                requestedAt: normalizeString(pendingAction.requestedAt) || null,
              }
            : null,
        lastAction:
          normalizeString(lastAction.id).length > 0
            ? {
                id: normalizeString(lastAction.id),
                kind: normalizeString(lastAction.kind) as DeploymentActionKind,
                status: normalizeString(lastAction.status) || 'completed',
                message: normalizeString(lastAction.message) || null,
                finishedAt: normalizeString(lastAction.finishedAt) || null,
              }
            : null,
        domainBinding: {
          sourceField: activeBindingSource,
          sourceLabel:
            activeBindingSource === 'none'
              ? null
              : (manifest?.domainSlots.find((slot) => slot.sourceField === activeBindingSource)
                  ?.label ?? activeBindingSource),
          isLocked: isDomainLocked,
          boundDomain: binding.boundDomain,
          boundAt: binding.boundAt,
          scope: binding.scope ?? policy?.domainBindingScope ?? 'registrable_domain',
        },
        entitlement: entitlement
          ? {
              id: entitlement.id,
              status: entitlement.status,
              startsAt: entitlement.startsAt,
              expiresAt: entitlement.expiresAt,
              plan: plan
                ? {
                    id: plan.id,
                    code: plan.code,
                    name: plan.name,
                    interval: plan.interval,
                  }
                : null,
            }
          : null,
        user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
        app: app ? { id: app.id, code: app.code, name: app.name, type: app.type } : null,
        latestToken: token
          ? {
              id: token.id,
              tokenHint: token.tokenHint,
              status: token.status,
              expiresAt: token.expiresAt,
              usedAt: token.usedAt,
              createdAt: token.createdAt,
            }
          : null,
      };
    }),
  );
}
