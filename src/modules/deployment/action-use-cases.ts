import type { DbExecutor } from '../../db/types';
import type { EncryptionKeyring } from '../../lib/settings-crypto';
import type { DeploymentDependencies } from './dependencies';
import { loadDeploymentEntitlement, type DeploymentEntitlementAccess } from './entitlement-policy';
import { normalizeDeploymentMeta } from './record-utils';
import { randomBytes } from 'node:crypto';

import { httpError } from '../../lib/errors';

import { decryptJson } from '../../lib/settings-crypto';

import { DeploymentRepository } from './repository';
import { type DeploymentActionKind, normalizeString } from './configuration-model';

interface DeploymentActionDependencies {
  createLicenseAccess: (db: DbExecutor) => DeploymentEntitlementAccess;
  createEventService: DeploymentDependencies['createEventService'];
  now: () => Date;
}

export class DeploymentActionUseCases {
  private readonly capabilities: DeploymentActionDependencies;
  constructor(
    input: DeploymentActionDependencies,
    private readonly db: DbExecutor,
    private readonly readEncryptionKeys: () => EncryptionKeyring,
  ) {
    this.capabilities = {
      createLicenseAccess: (db) => {
        const access = input.createLicenseAccess(db);
        return {
          findEntitlementById: access.findEntitlementById.bind(access),
          getPlanById: access.getPlanById.bind(access),
        };
      },
      createEventService: (db) => {
        const events = input.createEventService(db);
        return { capture: events.capture.bind(events) };
      },
      now: input.now,
    };
  }

  async requestDeploymentAction(
    input: Parameters<DeploymentActionUseCases['requestDeploymentActionLocked']>[0],
  ) {
    return this.db.transaction(async (tx) => {
      await new DeploymentRepository(tx).lockById(input.deploymentId);
      return new DeploymentActionUseCases(
        this.capabilities,
        tx,
        this.readEncryptionKeys,
      ).requestDeploymentActionLocked(input);
    });
  }
  private async requestDeploymentActionLocked(input: {
    commandId?: string;
    deploymentId: string;
    userId: string;
    kind: DeploymentActionKind;
  }) {
    const repository = new DeploymentRepository(this.db);
    const deployment = await repository.findDeploymentById(input.deploymentId);
    if (!deployment || deployment.userId !== input.userId) {
      throw httpError(404, 'Deployment not found');
    }
    if (deployment.deploymentMode === 'managed') {
      throw httpError(409, '托管实例请使用托管运维中的受控升级');
    }
    await loadDeploymentEntitlement(this.capabilities.createLicenseAccess(this.db), deployment);

    const meta = normalizeDeploymentMeta(deployment.meta);
    const runtimeAssetsUpdate = normalizeDeploymentMeta(meta.runtimeAssetsUpdate);

    if (input.kind === 'apply_runtime_images' || input.kind === 'ignore_runtime_images') {
      const hasAvailableRuntimeImage = Object.values(
        normalizeDeploymentMeta(runtimeAssetsUpdate.available),
      ).some((value) => normalizeString(value).length > 0);
      if (!hasAvailableRuntimeImage) {
        throw httpError(409, 'No available runtime image update to process');
      }
    }

    if (normalizeString(normalizeDeploymentMeta(meta.pendingAction).id))
      throw httpError(409, 'A deployment action is already pending');
    meta.pendingAction = {
      commandId: input.commandId,
      id: `fdda_${randomBytes(12).toString('base64url')}`,
      kind: input.kind,
      requestedAt: this.capabilities.now().toISOString(),
      requestedByUserId: input.userId,
    };

    const updated = await repository.updateDeployment(deployment.id, { meta });
    if (!updated) {
      throw httpError(500, 'Failed to queue deployment action');
    }

    await this.capabilities.createEventService(this.db).capture({
      userId: deployment.userId,
      appId: deployment.appId,
      eventName: 'deployment.action_requested',
      properties: {
        deploymentId: deployment.id,
        kind: input.kind,
      },
    });

    return { ok: true };
  }
  async pullDeploymentAction(input: { deploymentId: string; token: string }) {
    const repository = new DeploymentRepository(this.db);
    const deployment = await repository.findDeploymentById(input.deploymentId);

    if (!deployment) {
      throw httpError(404, 'Deployment not found');
    }

    const meta = normalizeDeploymentMeta(deployment.meta);
    const runtimeStatusReport = normalizeDeploymentMeta(meta.runtimeStatusReport);
    let expectedToken = '';

    if (runtimeStatusReport.token) {
      try {
        const decrypted = decryptJson<{ token?: string }>(
          runtimeStatusReport.token,
          this.readEncryptionKeys(),
        );
        expectedToken = normalizeString(decrypted.token);
      } catch {
        expectedToken = '';
      }
    }

    if (!expectedToken || expectedToken !== input.token) {
      throw httpError(401, 'Deployment action token is invalid');
    }

    const pendingAction = normalizeDeploymentMeta(meta.pendingAction);
    if (normalizeString(pendingAction.id).length === 0) {
      return { action: null };
    }

    return {
      action: {
        id: normalizeString(pendingAction.id),
        kind: normalizeString(pendingAction.kind),
        requestedAt: normalizeString(pendingAction.requestedAt) || null,
      },
    };
  }
  async completeDeploymentAction(
    input: Parameters<DeploymentActionUseCases['completeDeploymentActionLocked']>[0],
  ) {
    return this.db.transaction(async (tx) => {
      await new DeploymentRepository(tx).lockById(input.deploymentId);
      return new DeploymentActionUseCases(
        this.capabilities,
        tx,
        this.readEncryptionKeys,
      ).completeDeploymentActionLocked(input);
    });
  }
  private async completeDeploymentActionLocked(input: {
    deploymentId: string;
    token: string;
    actionId: string;
    status: 'completed' | 'failed';
    message?: string;
  }) {
    const repository = new DeploymentRepository(this.db);
    const deployment = await repository.findDeploymentById(input.deploymentId);

    if (!deployment) {
      throw httpError(404, 'Deployment not found');
    }

    const meta = normalizeDeploymentMeta(deployment.meta);
    const runtimeStatusReport = normalizeDeploymentMeta(meta.runtimeStatusReport);
    let expectedToken = '';

    if (runtimeStatusReport.token) {
      try {
        const decrypted = decryptJson<{ token?: string }>(
          runtimeStatusReport.token,
          this.readEncryptionKeys(),
        );
        expectedToken = normalizeString(decrypted.token);
      } catch {
        expectedToken = '';
      }
    }

    if (!expectedToken || expectedToken !== input.token) {
      throw httpError(401, 'Deployment action token is invalid');
    }

    const pendingAction = normalizeDeploymentMeta(meta.pendingAction);
    const lastAction = normalizeDeploymentMeta(meta.lastAction);
    if (
      !normalizeString(pendingAction.id) &&
      normalizeString(lastAction.id) === input.actionId &&
      lastAction.status === input.status
    )
      return { ok: true };
    if (normalizeString(pendingAction.id) !== input.actionId) {
      throw httpError(409, 'Deployment action does not match the current pending action');
    }

    meta.lastAction = {
      id: normalizeString(pendingAction.id),
      kind: normalizeString(pendingAction.kind),
      status: input.status,
      message: normalizeString(input.message),
      finishedAt: this.capabilities.now().toISOString(),
    };
    delete meta.pendingAction;

    const updated = await repository.updateDeployment(deployment.id, { meta });
    if (!updated) {
      throw httpError(500, 'Failed to complete deployment action');
    }

    await this.capabilities.createEventService(this.db).capture({
      userId: deployment.userId,
      appId: deployment.appId,
      eventName:
        input.status === 'completed' ? 'deployment.action_completed' : 'deployment.action_failed',
      properties: {
        deploymentId: deployment.id,
        kind: normalizeString(pendingAction.kind),
        message: normalizeString(input.message),
      },
    });

    return { ok: true };
  }
}
