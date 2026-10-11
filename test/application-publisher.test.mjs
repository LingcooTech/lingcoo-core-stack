import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  prepareApplicationRelease,
  publishApplicationRelease,
} from '../scripts/publish-application-release.mjs';
import { createRequire } from 'node:module';
const { GitHubActionsClient } = createRequire(import.meta.url)(
  '../src/modules/app/github-actions.ts',
);

test('portable publisher resolves Compose inside the checkout, pins image digests and registers a draft over HTTPS', async () => {
  const root = mkdtempSync(join(tmpdir(), 'stack-publisher-'));
  try {
    const definitionFile = join(root, 'app.yaml'),
      imagesFile = join(root, 'images.json');
    writeFileSync(
      definitionFile,
      'schemaVersion: 1\napp:\n  code: public_app\ndelivery:\n  kind: compose\n  compose: compose.yaml\n',
    );
    writeFileSync(join(root, 'compose.yaml'), 'services:\n  web:\n    image: ${WEB_IMAGE}\n');
    writeFileSync(
      imagesFile,
      JSON.stringify({ web: 'registry.example/app@sha256:' + 'a'.repeat(64) }),
    );
    const options = {
      root,
      definitionFile,
      imagesFile,
      version: '1.0.0',
      commit: 'b'.repeat(40),
      baseUrl: 'https://stack.example',
      token: 'stk_publish_' + 'a'.repeat(43),
    };
    const release = prepareApplicationRelease(options);
    assert.equal(release.definition.delivery.compose.services.web.image, '${WEB_IMAGE}');
    const result = await publishApplicationRelease(options, async (url, init) => {
      assert.equal(String(url), 'https://stack.example/v1/publishing/apps/public_app/releases');
      assert.equal(init.redirect, 'error');
      assert.equal(JSON.parse(init.body).commit, options.commit);
      return Response.json({ id: 'release-id', version: '1.0.0', status: 'draft' });
    });
    assert.equal(result.status, 'draft');
    await assert.rejects(
      () =>
        publishApplicationRelease(options, async () => {
          throw Error(options.token);
        }),
      (error) =>
        !error.message.includes(options.token) && /Stack request failed/.test(error.message),
    );
    await assert.rejects(
      () => publishApplicationRelease({ ...options, baseUrl: 'http://stack.example' }),
      /HTTPS/,
    );
    writeFileSync(imagesFile, JSON.stringify({ web: 'registry.example/app:latest' }));
    assert.throws(() => prepareApplicationRelease(options), /digest/);
    writeFileSync(imagesFile, '{}');
    rmSync(join(root, 'compose.yaml'));
    symlinkSync('/etc/passwd', join(root, 'compose.yaml'));
    assert.throws(() => prepareApplicationRelease(options), /escaped/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Actions client bounds responses and never exposes transport or upstream credential details', async () => {
  const repository = 'https://github.com/example/app';
  const bad = new GitHubActionsClient('secret', async () => {
    throw Error('secret in transport');
  });
  await assert.rejects(
    () => bad.runs(repository, 'publish.yml'),
    (e) => e.statusCode === 502 && !e.message.includes('secret'),
  );
  const huge = new GitHubActionsClient('', async () => new Response('x'.repeat(2000001)));
  await assert.rejects(() => huge.runs(repository, 'publish.yml'), /exceeds limit/);
  const unavailable = new GitHubActionsClient(
    'secret',
    async () => new Response('secret', { status: 503 }),
  );
  await assert.rejects(
    () =>
      unavailable.dispatch(repository, 'publish.yml', 'main', {
        stack_build_id: 'id',
        stack_commit: 'a'.repeat(40),
        stack_version: '1.0.0',
      }),
    { statusCode: 502 },
  );
});
