import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  parseApplicationDocument,
  validateApplicationDefinition,
  definitionDigest,
} from '../src/modules/app/definition';
import { GitHubApplicationReader } from '../src/modules/app/github';
const sample = () =>
  JSON.parse(readFileSync('examples/stack-compose-app.json', 'utf8')) as Record<string, unknown>;
test('definition accepts both JSON and YAML, preserves deterministic digest and rejects unknown or duplicated fields', () => {
  const json = validateApplicationDefinition(sample());
  const yaml = validateApplicationDefinition(
    parseApplicationDocument(
      'schemaVersion: 1\napp:\n  code: open_app\n  name: Open\n  license: MIT\n  acquisition: free\ndelivery:\n  kind: none\n',
    ),
  );
  assert.equal(yaml.app.acquisition, 'free');
  assert.equal(definitionDigest(json), definitionDigest(JSON.parse(JSON.stringify(json))));
  assert.throws(() => parseApplicationDocument('app: one\napp: two'), /Invalid JSON/);
  assert.throws(() => parseApplicationDocument('a: &x [a]\nb: *x'), /aliases/);
  assert.throws(() => validateApplicationDefinition({ ...sample(), password: 'plaintext' }));
});
test('Compose contract rejects host access, image tags, unknown variables and unsafe persistence', () => {
  for (const change of [
    { privileged: true },
    { build: '.' },
    { ports: ['8080:80'] },
    { container_name: 'global' },
    { volumes: ['/var/run/docker.sock:/var/run/docker.sock'] },
    { image: 'nginx:latest' },
    { environment: { X: '${UNDECLARED}' } },
  ]) {
    const definition = validateApplicationDefinition(sample());
    assert.equal(definition.delivery.kind, 'compose');
    if (definition.delivery.kind !== 'compose' || typeof definition.delivery.compose === 'string')
      throw Error('fixture');
    (definition.delivery.compose.services as Record<string, unknown>).web = {
      image: '${WEB_IMAGE}',
      ...change,
    };
    assert.throws(() => validateApplicationDefinition(definition));
  }
  const raw = sample();
  const d = raw.delivery as Record<string, unknown>;
  d.secretFields = [
    {
      key: 'PASSWORD',
      label: 'Password',
      type: 'secret',
      scope: 'preset',
      required: true,
      editable: false,
      advanced: true,
      defaultValue: 'leak',
    },
  ];
  assert.throws(() => validateApplicationDefinition(raw));
});
test('GitHub reads public or private definitions and Compose from the same resolved commit without executing code', async () => {
  const commit = 'a'.repeat(40),
    requests: string[] = [];
  const raw = sample();
  (raw.delivery as Record<string, unknown>).compose = 'stack/compose.yaml';
  const compose = (sample().delivery as Record<string, unknown>).compose;
  const reader = new GitHubApplicationReader('private-token', (async (url, init) => {
    const path = String(url);
    requests.push(path);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer private-token');
    if (path.includes('/commits/')) return Response.json({ sha: commit });
    assert.ok(path.endsWith('?ref=' + commit));
    const body = JSON.stringify(path.includes('compose.yaml') ? compose : raw);
    return Response.json({
      type: 'file',
      encoding: 'base64',
      size: body.length,
      content: Buffer.from(body).toString('base64'),
    });
  }) as typeof fetch);
  const preview = await reader.preview({
    repository: 'https://github.com/example/app',
    ref: 'release/v1',
    path: 'stack/app.yaml',
  });
  assert.equal(preview.source.commit, commit);
  assert.equal(requests.length, 3);
  assert.ok(!JSON.stringify(preview).includes('private-token'));
  await assert.rejects(() =>
    reader.preview({ repository: 'https://127.0.0.1/secret', ref: 'main', path: '../secret' }),
  );
});
