import { randomUUID } from 'node:crypto';

import type { DbClient } from '../../db/types';
import { httpError } from '../../lib/errors';
import { AppService } from '../app/service';
import { EventService } from '../event/service';
import { LicenseRepository } from '../license/repository';
import { LicenseService } from '../license/service';
import { InstallRepository } from './repository';

type InstallRecord = NonNullable<Awaited<ReturnType<InstallRepository['findInstallById']>>>;

export class InstallService {
  constructor(private readonly db: DbClient) {}

  private async resolveAppProduct(appCode: string, productCode?: string) {
    const appService = new AppService(this.db);
    const app = await appService.getPublicApp(appCode);
    const activeProducts = app.products.filter((product) => product.status === 'active');

    if (activeProducts.length === 0) {
      throw httpError(422, 'This app has no active product binding');
    }

    if (productCode) {
      const matched = activeProducts.find((product) => product.code === productCode);
      if (!matched) {
        throw httpError(404, 'Product is not bound to this app');
      }

      return {
        app,
        product: matched
      };
    }

    if (activeProducts.length > 1) {
      throw httpError(422, 'productCode is required because this app is bound to multiple products');
    }

    return {
      app,
      product: activeProducts[0]
    };
  }

  private async loadInstallForApp(appCode: string, installId: string) {
    const [app, install] = await Promise.all([
      new AppService(this.db).getPublicApp(appCode),
      new InstallRepository(this.db).findInstallById(installId)
    ]);

    if (!install) {
      throw httpError(404, 'Install not found');
    }

    if (install.appId && install.appId !== app.id) {
      throw httpError(404, 'Install does not belong to this app');
    }

    const product = await new LicenseRepository(this.db).getProductById(install.productId);
    if (!product) {
      throw httpError(500, 'Install product not found');
    }

    const allowedProduct = app.products.some((item) => item.id === product.id);
    if (!allowedProduct) {
      throw httpError(403, 'Install product is not allowed for this app');
    }

    return {
      app,
      install,
      product
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
    product: {
      id: string;
      code: string;
      name: string;
      type: string;
    };
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
      },
      product: {
        id: input.product.id,
        code: input.product.code,
        name: input.product.name,
        type: input.product.type
      }
    };
  }

  async registerInstall(input: {
    appCode: string;
    productCode?: string;
    extensionInstallId?: string;
    deviceFingerprint?: string;
    chromeProfileHint?: string;
    appVersion?: string;
  }) {
    const { app, product } = await this.resolveAppProduct(input.appCode, input.productCode);
    const repository = new InstallRepository(this.db);
    const extensionInstallId = input.extensionInstallId?.trim() || randomUUID();
    const existing = await repository.findInstallByExtensionInstallId(extensionInstallId);

    if (existing) {
      if (existing.appId && existing.appId !== app.id) {
        throw httpError(409, 'extensionInstallId is already used by another app');
      }

      if (existing.productId !== product.id) {
        throw httpError(409, 'extensionInstallId is already bound to another product');
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

      return this.toInstallPublicPayload({
        app,
        install: updated,
        product
      });
    }

    const install = await repository.createInstall({
      appId: app.id,
      productId: product.id,
      extensionInstallId,
      deviceFingerprint: input.deviceFingerprint,
      chromeProfileHint: input.chromeProfileHint,
      appVersion: input.appVersion
    });

    await new EventService(this.db).capture({
      productId: product.id,
      installId: install.id,
      eventName: 'install.registered',
      properties: {
        appCode: app.code,
        installId: install.id,
        extensionInstallId: install.extensionInstallId
      }
    });

    return this.toInstallPublicPayload({
      app,
      install,
      product
    });
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
      productId: detail.product.id,
      installId: install.id,
      eventName: 'install.bound',
      properties: {
        appCode: detail.app.code,
        installId: install.id
      }
    });

    return {
      ...this.toInstallPublicPayload({
        app: detail.app,
        install,
        product: detail.product
      }),
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

    return this.toInstallPublicPayload({
      app: detail.app,
      install,
      product: detail.product
    });
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

    const entitlements = await new AppService(this.db).listUserEntitlementsForApp(input.appCode, input.userId);
    const filteredItems = entitlements.items.filter((item) => item.productId === detail.product.id);
    const filteredSummary = entitlements.summary.filter((item) => item.productCode === detail.product.code);
    const install = await new InstallRepository(this.db).updateInstall(detail.install.id, {
      lastSeenAt: new Date()
    });

    if (!install) {
      throw httpError(500, 'Failed to refresh install state');
    }

    return {
      ...this.toInstallPublicPayload({
        app: detail.app,
        install,
        product: detail.product
      }),
      license: {
        active: filteredSummary.length > 0,
        items: filteredItems,
        summary: filteredSummary
      }
    };
  }
}
