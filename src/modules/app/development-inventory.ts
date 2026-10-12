import { type z } from 'zod';
import {
  type developmentInventoryQuerySchema,
  developmentInventorySchema,
} from '@lingcoo/contracts';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { decryptJson, getEncryptionKeys } from '../../lib/settings-crypto';
import { httpError } from '../../lib/errors';
import { AppLifecycleRepository } from './lifecycle-repository';
import { GitHubApplicationReader } from './github';
import { RegistryClient, type RegistryTransport } from './registry-client';
import { acrInventory, type AcrCredentials } from './acr-inventory';
export class DevelopmentInventory {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
    private readonly transport?: RegistryTransport,
  ) {}
  async list(id: string, input: z.infer<typeof developmentInventoryQuerySchema>) {
    const connection = await new AppLifecycleRepository(this.db).connection(id);
    if (!connection) throw httpError(404, 'Connection not found');
    const keys = getEncryptionKeys(this.env);
    if (connection.kind === 'github') {
      if (input.kind !== 'github') throw httpError(422, 'Use a GitHub inventory query');
      const { token } = decryptJson<{ token: string }>(connection.credentials, keys);
      return new GitHubApplicationReader(token).repositories(input.page);
    }
    if (input.kind === 'github') throw httpError(422, 'Use a GitHub connection');
    if (connection.kind === 'acr')
      return developmentInventorySchema.parse(
        await acrInventory(decryptJson<AcrCredentials>(connection.credentials, keys), input),
      );
    if (input.kind === 'namespaces' || input.kind === 'repositories') {
      const declared = (await new AppLifecycleRepository(this.db).projects()).flatMap((p) => {
        const images = (p.definition as { images?: { repository: string }[] } | null)?.images ?? [];
        return images
          .filter((i) => i.repository.startsWith(connection.host + '/'))
          .map((i) => i.repository.slice(connection.host!.length + 1));
      });
      const paths = [...new Set(declared)].sort();
      const rows =
        input.kind === 'namespaces'
          ? [...new Set(paths.map((p) => p.split('/')[0]!))].map((namespace) => ({
              id: namespace,
              name: namespace,
            }))
          : paths
              .filter((p) => !input.namespace || p.startsWith(input.namespace + '/'))
              .map((p) => ({
                id: p,
                name: p.slice(p.indexOf('/') + 1),
                namespace: p.split('/')[0]!,
                repository: p,
              }));
      return {
        items: rows.slice((input.page - 1) * 50, input.page * 50),
        nextPage: rows.length > input.page * 50 ? input.page + 1 : null,
      };
    }
    if (input.kind !== 'tags' || !input.repository)
      throw httpError(422, 'Specify a repository path');
    const credentials = decryptJson<{ username: string; password: string }>(
      connection.credentials,
      keys,
    );
    const result = await new RegistryClient(
      connection.host + '/' + input.repository,
      credentials,
      this.transport,
    ).tags(input.cursor);
    return {
      items: result.tags.map((tag) => ({ id: tag, name: tag })),
      nextPage: result.next ? input.page + 1 : null,
      nextCursor: result.next,
    };
  }
}
