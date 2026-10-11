import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { decryptJson, getEncryptionKeys } from '../../lib/settings-crypto';
import { httpError } from '../../lib/errors';
import { AppRepository } from './repository';
import { AppLifecycleRepository } from './lifecycle-repository';
import { validateApplicationDefinition } from './definition';
import { RegistryClient, type RegistryTransport } from './registry-client';

export class AppImagesService {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
    private readonly transport?: RegistryTransport,
  ) {}
  private async client(code: string, key: string, connectionId?: string) {
    const app = await new AppRepository(this.db).findAppByCode(code);
    if (!app) throw httpError(404, 'Application not found');
    const repo = new AppLifecycleRepository(this.db),
      source = await repo.source(app.id);
    if (!source) throw httpError(422, 'Application definition is required');
    const image = validateApplicationDefinition(source.definition).images.find(
      (v) => v.key === key,
    );
    if (!image) throw httpError(404, 'Image component not declared');
    let credentials: { username: string; password: string } | undefined;
    if (connectionId) {
      const connection = await repo.connection(connectionId),
        host = image.repository.split('/')[0]!.toLowerCase();
      if (!connection || connection.kind !== 'registry' || connection.host !== host)
        throw httpError(422, 'Registry connection does not match the declared image host');
      credentials = decryptJson<{ username: string; password: string }>(
        connection.credentials,
        getEncryptionKeys(this.env),
      );
    }
    return new RegistryClient(image.repository, credentials, this.transport);
  }
  async tags(code: string, key: string, input: { connectionId?: string; last?: string }) {
    return (await this.client(code, key, input.connectionId)).tags(input.last);
  }
  async resolve(code: string, key: string, input: { connectionId?: string; reference: string }) {
    return (await this.client(code, key, input.connectionId)).manifest(input.reference);
  }
}
