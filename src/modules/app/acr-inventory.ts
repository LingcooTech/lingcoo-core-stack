import EnterpriseClient, {
  ListNamespaceRequest,
  ListRepositoryRequest,
  ListRepoTagRequest,
} from '@alicloud/cr20181201';
import { $OpenApiUtil } from '@alicloud/openapi-core';
import { RuntimeOptions } from '@darabonba/typescript';
import { z } from 'zod';
import {
  developmentInventorySchema,
  type developmentInventoryQuerySchema,
} from '@lingcoo/contracts';
import { httpError } from '../../lib/errors';
export type AcrCredentials = {
  region: string;
  edition: 'enterprise';
  instanceId: string;
  accessKeyId: string;
  accessKeySecret: string;
};
type Query = z.infer<typeof developmentInventoryQuerySchema>;
const digest = (value?: string) =>
  value && /^(?:sha256:)?[a-f0-9]{64}$/.test(value)
    ? 'sha256:' + value.replace(/^sha256:/, '')
    : undefined;
export function parseAcrInventory(
  raw: unknown,
  input: Query,
): z.infer<typeof developmentInventorySchema> {
  const common = z
    .object({ isSuccess: z.literal(true), totalCount: z.coerce.number().int().nonnegative() })
    .parse(raw);
  if (input.kind === 'namespaces') {
    const { namespaces } = z
      .object({
        namespaces: z
          .array(z.object({ namespaceId: z.string(), namespaceName: z.string() }))
          .max(50)
          .default([]),
      })
      .parse(raw);
    return {
      items: namespaces.map((r) => ({ id: r.namespaceId, name: r.namespaceName })),
      nextPage: input.page * 50 < common.totalCount ? input.page + 1 : null,
    };
  }
  if (input.kind === 'repositories') {
    const { repositories } = z
      .object({
        repositories: z
          .array(
            z.object({ repoId: z.string(), repoName: z.string(), repoNamespaceName: z.string() }),
          )
          .max(50)
          .default([]),
      })
      .parse(raw);
    return {
      items: repositories.map((r) => ({
        id: r.repoId,
        name: r.repoName,
        namespace: r.repoNamespaceName,
        repository: r.repoNamespaceName + '/' + r.repoName,
      })),
      nextPage: input.page * 50 < common.totalCount ? input.page + 1 : null,
    };
  }
  const { images } = z
    .object({
      images: z
        .array(z.object({ tag: z.string(), digest: z.string().optional() }))
        .max(50)
        .default([]),
    })
    .parse(raw);
  return {
    items: images.map((r) => ({ id: r.tag, name: r.tag, digest: digest(r.digest) })),
    nextPage: input.page * 50 < common.totalCount ? input.page + 1 : null,
  };
}
export async function acrInventory(credentials: AcrCredentials, input: Query) {
  if (input.kind === 'tags' && !input.repoId)
    throw httpError(422, 'Select an ACR repository first');
  const config = {
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
    regionId: credentials.region,
    endpoint: `cr.${credentials.region}.aliyuncs.com`,
    connectTimeout: 10000,
    readTimeout: 15000,
  };
  try {
    const client = new EnterpriseClient(new $OpenApiUtil.Config(config)),
      runtime = new RuntimeOptions({ autoretry: false, connectTimeout: 10000, readTimeout: 15000 });
    const base = { instanceId: credentials.instanceId, pageNo: input.page, pageSize: 50 };
    const result =
      input.kind === 'namespaces'
        ? await client.listNamespaceWithOptions(new ListNamespaceRequest(base), runtime)
        : input.kind === 'repositories'
          ? await client.listRepositoryWithOptions(
              new ListRepositoryRequest({ ...base, repoNamespaceName: input.namespace }),
              runtime,
            )
          : await client.listRepoTagWithOptions(
              new ListRepoTagRequest({ ...base, repoId: input.repoId }),
              runtime,
            );
    return developmentInventorySchema.parse(parseAcrInventory(result.body, input));
  } catch {
    // SDK errors can contain request credentials. Never expose them to clients or logs.
    throw httpError(502, 'ACR inventory unavailable; check region, instance and read permissions');
  }
}
