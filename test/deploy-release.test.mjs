import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const sha = 'a'.repeat(40);
function fixture(extra = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'stack-release-'));
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  for (const file of ['docker-compose.prod.yml', 'Caddyfile'])
    writeFileSync(path.join(dir, file), 'fixture');
  const commands = {
    git: `echo "git $*" >> "$COMMAND_LOG"; case "$1" in status) ;; rev-parse) echo "$IMAGE_TAG";; esac`,
    docker: `echo "docker $*" >> "$COMMAND_LOG"; case "$1 $2" in 'image inspect') echo "$IMAGE_TAG";; esac; case "$*" in *scripts/run-migrations.mjs*) [ "\${FAIL_MIGRATION:-0}" != 1 ] || exit 9;; esac`,
    curl: `printf '{"status":"ready","version":"%s"}' "\${HEALTH_VERSION:-$IMAGE_TAG}"`,
    sleep: 'exit 0',
    flock: 'exit 0',
  };
  for (const [name, script] of Object.entries(commands))
    writeFileSync(path.join(bin, name), '#!/bin/sh\n' + script + '\n', { mode: 0o755 });
  const env = {
    ...process.env,
    PATH: bin + ':' + process.env.PATH,
    COMMAND_LOG: path.join(dir, 'commands'),
    DEPLOY_PATH: dir,
    ACR_REGISTRY: 'fixture.example.test',
    ACR_USERNAME: 'fixture',
    ACR_PASSWORD: 'fixture-only',
    FD_CORE_IMAGE_NAME: 'fixture.example.test/stack',
    FD_CORE_RELEASE_IMAGE: 'fixture.example.test/stack@sha256:' + 'b'.repeat(64),
    IMAGE_TAG: sha,
    ...extra,
  };
  return { dir, env, close: () => rmSync(dir, { recursive: true, force: true }) };
}
test('release uses its exact SHA, drains workers before migration and retains verified assets', () => {
  const f = fixture();
  try {
    const result = spawnSync('sh', ['scripts/deploy/deploy.sh'], { env: f.env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const log = readFileSync(f.env.COMMAND_LOG, 'utf8');
    assert(log.includes('git checkout --detach ' + sha));
    assert(!log.includes('reset --hard'));
    assert(!log.includes('prune'));
    assert(log.indexOf('stop -t 45 worker') < log.indexOf('scripts/run-migrations.mjs'));
    assert(existsSync(path.join(f.dir, '.deploy-releases', sha, 'verified')));
    assert.equal(readFileSync(path.join(f.dir, '.deploy-releases/current'), 'utf8').trim(), sha);
  } finally {
    f.close();
  }
});
test('migration failure prevents runtime replacement and release verification', () => {
  const f = fixture({ FAIL_MIGRATION: '1' });
  try {
    const result = spawnSync('sh', ['scripts/deploy/deploy.sh'], { env: f.env, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    const log = readFileSync(f.env.COMMAND_LOG, 'utf8');
    assert(!log.includes('--wait-timeout 120 api worker caddy'));
    assert(!existsSync(path.join(f.dir, '.deploy-releases', sha, 'verified')));
  } finally {
    f.close();
  }
});
test('rollback requires a verified target and explicit schema compatibility', () => {
  const f = fixture({ DEPLOY_ROLLBACK: '1', DEPLOY_ROLLBACK_SCHEMA_COMPATIBLE: '1' });
  try {
    const blocked = spawnSync('sh', ['scripts/deploy/deploy.sh'], { env: f.env, encoding: 'utf8' });
    assert.notEqual(blocked.status, 0);
    mkdirSync(path.join(f.dir, '.deploy-releases', sha), { recursive: true });
    writeFileSync(path.join(f.dir, '.deploy-releases', sha, 'verified'), 'fixture');
    writeFileSync(path.join(f.dir, '.deploy-releases', sha, 'image'), f.env.FD_CORE_RELEASE_IMAGE);
    writeFileSync(f.env.COMMAND_LOG, '');
    const result = spawnSync('sh', ['scripts/deploy/deploy.sh'], { env: f.env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert(!readFileSync(f.env.COMMAND_LOG, 'utf8').includes('scripts/run-migrations.mjs'));
  } finally {
    f.close();
  }
});

test('failed readiness preserves the previously verified digest even for the same SHA', () => {
  const previous = 'fixture.example.test/stack@sha256:' + 'b'.repeat(64);
  const f = fixture({
    HEALTH_VERSION: 'different',
    FD_CORE_RELEASE_IMAGE: 'fixture.example.test/stack@sha256:' + 'c'.repeat(64),
  });
  try {
    const dir = path.join(f.dir, '.deploy-releases', sha);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'verified'), 'fixture');
    writeFileSync(path.join(dir, 'image'), previous);
    writeFileSync(path.join(f.dir, '.deploy-releases/current'), sha);
    const result = spawnSync('sh', ['scripts/deploy/deploy.sh'], { env: f.env, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(path.join(dir, 'image'), 'utf8'), previous);
    assert.equal(readFileSync(path.join(f.dir, '.deploy-releases/current'), 'utf8'), sha);
  } finally {
    f.close();
  }
});

test('a successful same-SHA redeploy preserves the last different rollback release', () => {
  const f = fixture();
  try {
    mkdirSync(path.join(f.dir, '.deploy-releases'), { recursive: true });
    writeFileSync(path.join(f.dir, '.deploy-releases/current'), sha);
    const previous = 'd'.repeat(40);
    writeFileSync(path.join(f.dir, '.deploy-releases/previous'), previous);
    const result = spawnSync('sh', ['scripts/deploy/deploy.sh'], { env: f.env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(path.join(f.dir, '.deploy-releases/previous'), 'utf8'), previous);
    assert.equal(readFileSync(path.join(f.dir, '.deploy-releases/current'), 'utf8').trim(), sha);
  } finally {
    f.close();
  }
});
