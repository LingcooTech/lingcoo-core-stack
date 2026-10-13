import { acquireTransactionLock } from '../../db/locks';
import { AppReadiness } from './readiness';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { listDeliveryManifestFields, normalizeDeliveryManifest } from '../../lib/delivery-manifest';
import { AppRepository } from './repository';
import { AppLifecycleRepository } from './lifecycle-repository';
import type { AppDependencies } from './dependencies';
type ManifestDependencies = Pick<
  AppDependencies,
  'createDeliverySettings' | 'createEventService' | 'createLicenseAccess' | 'now'
>;
export class AppManifestService {
  private readonly capabilities: ManifestDependencies;
  constructor(
    dependencies: ManifestDependencies,
    private readonly db: DbExecutor,
    private readonly env?: AppEnv,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.capabilities = {
      createDeliverySettings: dependencies.createDeliverySettings,
      createEventService: dependencies.createEventService,
      createLicenseAccess: dependencies.createLicenseAccess,
      now: dependencies.now,
    };
  }
  private requireEnv() {
    if (!this.env) throw httpError(503, 'Application runtime settings are unavailable');
    return this.env;
  }
  private normalizeMeta(meta: unknown) {
    return meta && typeof meta === 'object' && !Array.isArray(meta)
      ? { ...(meta as Record<string, unknown>) }
      : {};
  }
  private normalizeDeliveryManifestSource(value: unknown) {
    const raw = this.normalizeMeta(value);
    return {
      repoUrl: typeof raw.repoUrl === 'string' ? raw.repoUrl.trim() : '',
      repoBranch: typeof raw.repoBranch === 'string' ? raw.repoBranch.trim() : '',
      manifestPath: typeof raw.manifestPath === 'string' ? raw.manifestPath.trim() : '',
      manifestUrl: typeof raw.manifestUrl === 'string' ? raw.manifestUrl.trim() : '',
    };
  }

  private resolveDeliveryManifestUrl(input: {
    repoUrl?: string;
    repoBranch?: string;
    manifestPath?: string;
    manifestUrl?: string;
  }) {
    if (input.manifestUrl?.trim()) {
      return input.manifestUrl.trim();
    }

    const repoUrl = input.repoUrl?.trim() ?? '';
    const repoBranch = input.repoBranch?.trim() || 'main';
    const manifestPath = input.manifestPath?.trim() || 'fd-delivery.manifest.json';

    if (!repoUrl) {
      throw httpError(422, 'Delivery manifest source repoUrl is not configured');
    }

    const httpsMatch = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
    const sshMatch = repoUrl.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
    const match = httpsMatch ?? sshMatch;

    if (!match) {
      throw httpError(422, 'Only GitHub repository URLs are supported for manifest sync');
    }

    const [, owner, repo] = match;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${repoBranch}/${manifestPath}`;
  }

  async sync(
    appCode: string,
    input: {
      repoUrl?: string;
      repoBranch?: string;
      manifestPath?: string;
      manifestUrl?: string;
    },
    actorUserId: string,
  ) {
    const app = await new AppRepository(this.db).findAppByCode(appCode);
    if (!app) {
      throw httpError(404, 'App not found');
    }

    if ((await new AppLifecycleRepository(this.db).project(appCode))?.definition)
      throw httpError(
        422,
        'Source-owned delivery definition is read-only; select a published release',
      );
    const meta = this.normalizeMeta(app.meta);
    const currentSource = this.normalizeDeliveryManifestSource(meta.deliveryManifestSource);
    const currentManifest = this.normalizeMeta(meta.deliveryManifest);
    const currentInstaller = this.normalizeMeta(currentManifest.installer);

    const nextSource = {
      repoUrl:
        input.repoUrl?.trim() ||
        currentSource.repoUrl ||
        (typeof currentInstaller.repoUrl === 'string' ? currentInstaller.repoUrl.trim() : ''),
      repoBranch:
        input.repoBranch?.trim() ||
        currentSource.repoBranch ||
        (typeof currentInstaller.repoBranch === 'string'
          ? currentInstaller.repoBranch.trim()
          : 'main'),
      manifestPath:
        input.manifestPath?.trim() || currentSource.manifestPath || 'fd-delivery.manifest.json',
      manifestUrl: input.manifestUrl?.trim() || currentSource.manifestUrl || '',
    };

    const manifestUrl = this.resolveDeliveryManifestUrl(nextSource);
    let response: Response;

    try {
      response = await this.fetcher(manifestUrl, { signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      throw httpError(
        502,
        `Failed to fetch delivery manifest: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    if (!response.ok) {
      throw httpError(502, `Failed to fetch delivery manifest: ${response.status}`);
    }

    let remoteManifest: unknown;
    try {
      remoteManifest = (await response.json()) as unknown;
    } catch (error) {
      throw httpError(
        502,
        `Failed to parse delivery manifest JSON: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    const manifest = normalizeDeliveryManifest(remoteManifest);

    if (!manifest) {
      throw httpError(502, 'Delivery manifest is empty or invalid');
    }

    const nextMeta = {
      ...meta,
      deliveryManifest: remoteManifest,
      deliveryManifestSource: nextSource,
    };

    await this.db.transaction(async (tx) => {
      await acquireTransactionLock(tx, 'app:publication:' + appCode);
      if ((await new AppLifecycleRepository(tx).project(appCode))?.definition)
        throw httpError(
          422,
          'Source-owned delivery definition is read-only; select a published release',
        );
      const current = await new AppRepository(tx).lockAppByCode(appCode);
      if (!current) throw httpError(404, 'App not found');
      await new AppRepository(tx).updateAppMetaByCode(appCode, {
        ...this.normalizeMeta(current.meta),
        deliveryManifest: nextMeta.deliveryManifest,
        deliveryManifestSource: nextMeta.deliveryManifestSource,
      });

      const presetDefaults = Object.fromEntries(
        listDeliveryManifestFields(manifest, { scope: 'preset', includeSecrets: false })
          .filter((field) => typeof field.defaultValue !== 'undefined')
          .map((field) => [field.key, field.defaultValue!]),
      );

      const installerPatch = {
        repoUrl: manifest.installer.repoUrl || nextSource.repoUrl || undefined,
        repoBranch: manifest.installer.repoBranch || nextSource.repoBranch || undefined,
      };

      await this.capabilities.createDeliverySettings(tx, this.requireEnv()).upsertSettings(
        appCode,
        {
          values: presetDefaults,
          installer: installerPatch,
        },
        actorUserId,
      );

      if (current.status === 'active')
        await new AppReadiness(tx, this.env, this.capabilities).assertConfiguration(appCode);
      await this.capabilities.createEventService(tx).capture({
        userId: actorUserId,
        appId: app.id,
        eventName: 'app.delivery_manifest_synced',
        properties: {
          appCode,
          manifestUrl,
          repoUrl: nextSource.repoUrl,
          repoBranch: nextSource.repoBranch,
          manifestPath: nextSource.manifestPath || null,
          appliedPresetDefaults: Object.keys(presetDefaults),
        },
      });
    });
    return;
  }
}
