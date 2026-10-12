import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const generator = resolve('scripts/create-stack-app.mjs');
const childEnv = { ...process.env };
delete childEnv.NODE_TEST_CONTEXT;
test('generated Compose kit runs outside Stack, rejects unsafe definitions and validates immutable releases', () => {
  const root = mkdtempSync(join(tmpdir(), 'stack-kit-test-')),
    target = join(root, 'application');
  const run = (...args) =>
    execFileSync(process.execPath, args, {
      cwd: target,
      encoding: 'utf8',
      env: childEnv,
      stdio: 'pipe',
    });
  try {
    execFileSync(process.execPath, [
      generator,
      '--kind',
      'compose',
      '--directory',
      target,
      '--code',
      'kit_test',
      '--image',
      'registry.example.com/team/kit',
    ]);
    const result = JSON.parse(run('scripts/stack-toolkit.cjs', 'validate'));
    assert.equal(result.appCode, 'kit_test');
    assert.equal(result.runtimeVerified, false);
    assert.equal(result.images[0].repository, 'registry.example.com/team/kit');
    assert.equal(
      JSON.parse(readFileSync(join(target, 'stack/toolchain.json'))).validatorSha256,
      createHash('sha256')
        .update(readFileSync(join(target, 'scripts/stack-toolkit.cjs')))
        .digest('hex'),
    );
    assert.match(run('--test', 'server.test.mjs'), /pass 1/);
    writeFileSync(
      join(target, 'images.json'),
      JSON.stringify({ web: 'registry.example.com/team/kit@sha256:' + 'a'.repeat(64) }),
    );
    run(
      'scripts/stack-toolkit.cjs',
      'release',
      'stack/app.yaml',
      'images.json',
      '1.0.0',
      'b'.repeat(40),
    );
    writeFileSync(
      join(target, 'images.json'),
      JSON.stringify({ web: 'registry.example.com/other/kit@sha256:' + 'a'.repeat(64) }),
    );
    assert.throws(
      () =>
        run(
          'scripts/stack-toolkit.cjs',
          'release',
          'stack/app.yaml',
          'images.json',
          '1.0.0',
          'b'.repeat(40),
        ),
      /match every declared repository/,
    );
    const compose = join(target, 'stack/compose.yaml');
    writeFileSync(compose, 'services:\n  web:\n    image: ${WEB_IMAGE}\n    privileged: true\n');
    assert.throws(() => run('scripts/stack-toolkit.cjs', 'validate'), /unrecognized_keys/);
    rmSync(compose);
    const external = join(root, 'external.yaml');
    writeFileSync(external, 'services: {}');
    symlinkSync(external, compose);
    assert.throws(() => run('scripts/stack-toolkit.cjs', 'validate'), /repository root/);
    const before = readFileSync(join(target, 'stack/app.yaml'), 'utf8');
    const rejected = spawnSync(process.execPath, [
      generator,
      '--kind',
      'compose',
      '--directory',
      target,
      '--code',
      'another',
      '--image',
      'registry.example.com/team/other',
    ]);
    assert.notEqual(rejected.status, 0);
    assert.equal(readFileSync(join(target, 'stack/app.yaml'), 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('no-deployment kit registers no images and provides an entry without claiming authorization implementation', () => {
  const root = mkdtempSync(join(tmpdir(), 'stack-none-kit-')),
    target = join(root, 'application');
  try {
    execFileSync(process.execPath, [
      generator,
      '--kind',
      'none',
      '--directory',
      target,
      '--code',
      'extension_kit',
      '--url',
      'https://example.com/extension',
    ]);
    const result = JSON.parse(
      execFileSync(process.execPath, ['scripts/stack-toolkit.cjs', 'validate'], {
        cwd: target,
        encoding: 'utf8',
      }),
    );
    assert.equal(result.delivery, 'none');
    assert.deepEqual(result.images, []);
    writeFileSync(join(target, 'images.json'), '{}');
    execFileSync(
      process.execPath,
      [
        'scripts/stack-toolkit.cjs',
        'release',
        'stack/app.yaml',
        'images.json',
        '1.0.0',
        'b'.repeat(40),
      ],
      { cwd: target },
    );
    const workflow = readFileSync(join(target, '.github/workflows/stack-release.yml'), 'utf8');
    assert.ok(!workflow.includes('docker/login-action'));
    assert.match(workflow, /workflow_dispatch/);
    assert.match(readFileSync(join(target, 'README.md'), 'utf8'), /不会自动/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const dockerAvailable =
  spawnSync('docker', ['info'], { timeout: 15000, stdio: 'ignore' }).status === 0;
test(
  'generated image starts under its declared budget and serves health and entry',
  { skip: !dockerAvailable },
  () => {
    const root = mkdtempSync(join(tmpdir(), 'stack-kit-image-')),
      target = join(root, 'application');
    const image = 'stack-kit-test:' + Date.now();
    try {
      execFileSync(process.execPath, [
        generator,
        '--kind',
        'compose',
        '--directory',
        target,
        '--code',
        'image_kit',
        '--image',
        'registry.example.com/team/kit',
      ]);
      execFileSync('docker', ['build', '--tag', image, '.'], {
        cwd: target,
        timeout: 180000,
        stdio: 'pipe',
      });
      execFileSync(process.execPath, ['scripts/smoke-image.mjs', image], {
        cwd: target,
        timeout: 90000,
        env: childEnv,
        stdio: 'pipe',
      });
    } finally {
      spawnSync('docker', ['image', 'rm', image], { timeout: 30000, stdio: 'ignore' });
      rmSync(root, { recursive: true, force: true });
    }
  },
);
