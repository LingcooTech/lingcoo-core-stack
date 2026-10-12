import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubApplicationReader } from '../src/modules/app/github';
import { parseAcrInventory } from '../src/modules/app/acr-inventory';
import {
  developmentInventoryQuerySchema,
  applicationConnectionInputSchema,
} from '@lingcoo/contracts';
test('GitHub repositories use a fixed authenticated endpoint and explicit pagination', async () => {
  const reader = new GitHubApplicationReader('not-returned', async (url, init) => {
    assert.equal(new URL(String(url)).origin, 'https://api.github.com');
    assert.equal(new URL(String(url)).searchParams.get('page'), '2');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer not-returned');
    return Response.json(
      Array.from({ length: 50 }, (_, id) => ({
        id,
        full_name: 'example/repo' + id,
        html_url: 'https://github.com/example/repo' + id,
        private: true,
        default_branch: 'main',
        description: null,
      })),
    );
  });
  const result = await reader.repositories(2);
  assert.equal(result.items.length, 50);
  assert.equal(result.nextPage, 3);
  assert.ok(!JSON.stringify(result).includes('not-returned'));
});
test('ACR enterprise responses retain namespace, repository identity, digest and page boundaries', () => {
  assert.deepEqual(
    parseAcrInventory(
      {
        isSuccess: true,
        totalCount: '1',
        namespaces: [{ namespaceId: 'ns-team', namespaceName: 'team' }],
      },
      { kind: 'namespaces', page: 1 },
    ),
    { items: [{ id: 'ns-team', name: 'team' }], nextPage: null },
  );
  const repositories = parseAcrInventory(
    {
      isSuccess: true,
      totalCount: '51',
      repositories: [{ repoId: '123', repoName: 'web', repoNamespaceName: 'team' }],
    },
    { kind: 'repositories', page: 1 },
  );
  assert.equal(repositories.items[0]?.repository, 'team/web');
  assert.equal(repositories.nextPage, 2);
  const tags = parseAcrInventory(
    { isSuccess: true, totalCount: '1', images: [{ tag: 'v1', digest: 'a'.repeat(64) }] },
    { kind: 'tags', page: 1 },
  );
  assert.equal(tags.items[0]?.digest, 'sha256:' + 'a'.repeat(64));
  assert.throws(
    () => parseAcrInventory({ isSuccess: false, totalCount: '0' }, { kind: 'tags', page: 1 }),
    'malformed responses must not become empty successful lists',
  );
  assert.equal(
    developmentInventoryQuerySchema.safeParse({ kind: 'tags', repository: '../../etc' }).success,
    false,
  );
  assert.equal(
    applicationConnectionInputSchema.safeParse({
      kind: 'acr',
      name: 'Bad',
      edition: 'enterprise',
      region: 'cn-beijing',
      host: 'registry.example.com',
      accessKeyId: 'id',
      accessKeySecret: 'secret',
    }).success,
    false,
  );
});
