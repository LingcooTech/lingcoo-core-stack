import { randomUUID } from 'node:crypto';

import type { DbClient } from '../../db/types';
import { httpError } from '../../lib/errors';
import { AppService } from '../app/service';
import { EventService } from '../event/service';
import { LicenseService } from '../license/service';
import { InstallRepository } from './repository';

type InstallRecord = NonNullable<Awaited<ReturnType<InstallRepository['findInstallById']>>>;

export class InstallService {
  constructor(private readonly db: DbClient) {}

  private async resolveApp(appCode: string) {
    const app = await new AppService(this.db).getPublicApp(appCode);
    return { app };
  }

  private async loadInstallForApp(appCode: string, installId: string) {
    const [appResult, install] = await Promise.all([
      this.resolveApp(appCode),
      new InstallRepository(this.db).findInstallById(installId)
    ]);

    if (!install) {
      throw httpError(404, 'Install not found');
    }

    if (install.appId !== appResult.app.id) {
      throw httpError(404, 'Install does not belong to this app');
    }

    return {
      app: appResult.app,
      install
    };
  }

  private toInstallPublicPayload(input: {
    app: {
      id: string;
      code: string;
      name: string;
      type: string;
    };
    install: InstallRecord;
  }) {
    return {
      app: {
        id: input.app.id,
        code: input.app.code,
        name: input.app.name,
        type: input.app.type
      },
      install: {
        id: input.install.id,
        extensionInstallId: input.install.extensionInstallId,
        status: input.install.status,
        linkedUser: Boolean(input.install.userId),
        lastSeenAt: input.install.lastSeenAt,
        createdAt: input.install.createdAt,
        updatedAt: input.install.updatedAt,
        appVersion: input.install.appVersion,
        chromeProfileHint: input.install.chromeProfileHint
      }
    };
  }

  async registerInstall(input: {
    appCode: string;
    extensionInstallId?: string;
    deviceFingerprint?: string;
    chromeProfileHint?: string;
    appVersion?: string;
  }) {
    const { app } = await this.resolveApp(input.appCode);
    const repository = new InstallRepository(this.db);
    const extensionInstallId = input.extensionInstallId?.trim() || randomUUID();
    const existing = await repository.findInstallByExtensionInstallId(extensionInstallId);

    if (existing) {
      if (existing.appId !== app.id) {
        throw httpError(409, 'extensionInstallId is already used by another app');
      }

      const updated = await repository.updateInstall(existing.id, {
        appId: app.id,
        deviceFingerprint: input.deviceFingerprint ?? existing.deviceFingerprint,
        chromeProfileHint: input.chromeProfileHint ?? existing.chromeProfileHint,
        appVersion: input.appVersion ?? existing.appVersion,
        lastSeenAt: new Date(),
        status: 'active'
      });

      if (!updated) {
        throw httpError(500, 'Failed to update install');
      }

      return this.toInstallPublicPayload({ app, install: updated });
    }

    const install = await repository.createInstall({
      appId: app.id,
      extensionInstallId,
      deviceFingerprint: input.deviceFingerprint,
      chromeProfileHint: input.chromeProfileHint,
      appVersion: input.appVersion
    });

    await new EventService(this.db).capture({
      appId: app.id,
      installId: install.id,
      eventName: 'install.registered',
      properties: {
        appCode: app.code,
        installId: install.id,
        extensionInstallId: install.extensionInstallId
      }
    });

    return this.toInstallPublicPayload({ app, install });
  }

  async bindInstall(input: {
    appCode: string;
    installId: string;
    userId: string;
  }) {
    const detail = await this.loadInstallForApp(input.appCode, input.installId);

    if (detail.install.userId && detail.install.userId !== input.userId) {
      throw httpError(409, 'Install is already bound to another user');
    }

    const install =
      detail.install.userId === input.userId
        ? detail.install
        : await new InstallRepository(this.db).updateInstall(detail.install.id, {
            userId: input.userId,
            appId: detail.app.id,
            lastSeenAt: new Date(),
            status: 'active'
          });

    if (!install) {
      throw httpError(500, 'Failed to bind install');
    }

    await new EventService(this.db).capture({
      userId: input.userId,
      appId: detail.app.id,
      installId: install.id,
      eventName: 'install.bound',
      properties: {
        appCode: detail.app.code,
        installId: install.id
      }
    });

    return {
      ...this.toInstallPublicPayload({ app: detail.app, install }),
      binding: {
        userId: input.userId,
        bound: true
      }
    };
  }

  async heartbeat(input: {
    appCode: string;
    installId: string;
    deviceFingerprint?: string;
    chromeProfileHint?: string;
    appVersion?: string;
  }) {
    const detail = await this.loadInstallForApp(input.appCode, input.installId);
    const install = await new InstallRepository(this.db).updateInstall(detail.install.id, {
      appId: detail.app.id,
      deviceFingerprint: input.deviceFingerprint ?? detail.install.deviceFingerprint,
      chromeProfileHint: input.chromeProfileHint ?? detail.install.chromeProfileHint,
      appVersion: input.appVersion ?? detail.install.appVersion,
      lastSeenAt: new Date(),
      status: 'active'
    });

    if (!install) {
      throw httpError(500, 'Failed to update install heartbeat');
    }

    return this.toInstallPublicPayload({ app: detail.app, install });
  }

  async getInstallLicense(input: {
    appCode: string;
    installId: string;
    userId: string;
  }) {
    const detail = await this.loadInstallForApp(input.appCode, input.installId);

    if (!detail.install.userId) {
      throw httpError(409, 'Install is not bound to a user');
    }

    if (detail.install.userId !== input.userId) {
      throw httpError(403, 'Install belongs to another user');
    }

    const entitlements = await new LicenseService(this.db).listUserEntitlementsByAppId(detail.app.id, input.userId);
    const install = await new InstallRepository(this.db).updateInstall(detail.install.id, {
      lastSeenAt: new Date()
    });

    if (!install) {
      throw httpError(500, 'Failed to refresh install state');
    }

    return {
      ...this.toInstallPublicPayload({ app: detail.app, install }),
      license: {
        active: entitlements.summary.length > 0,
        items: entitlements.items,
        summary: entitlements.summary
      }
    };
  }
}
