import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildRemoteInstallCommand,
  buildExchangeCurl,
  quoteShellArgument,
} from '../src/modules/deployment/bootstrap-payload';
test('installer parameters preserve quotes, whitespace and shell expressions as literal data', () => {
  const value = "path with 'quotes' $(printf unexpected) `printf unexpected`\nsecond line";
  const result = spawnSync(
    'bash',
    ['-c', `value=${quoteShellArgument(value)}\nprintf '%s' "$value"`],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, value);
  const command = buildRemoteInstallCommand({
    token: value,
    exchangeUrl: 'https://example.test/exchange',
    remoteInstallScriptUrl: 'https://example.test/install.sh',
    remoteInstallScriptSha256: 'a'.repeat(64),
    installPath: value,
    repoBranch: value,
  });
  assert.equal(spawnSync('bash', ['-n'], { input: command }).status, 0);
  assert.equal(
    spawnSync('bash', ['-n'], { input: buildExchangeCurl(value, 'https://example.test') }).status,
    0,
  );
});

test('bootstrap executes only the declared installer bytes and removes temporary downloads', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stack-installer-'));
  const bin = join(dir, 'bin'),
    downloads = join(dir, 'downloads');
  mkdirSync(bin);
  mkdirSync(downloads);
  const installer = 'printf "%s" "$FD_STACK_DEPLOY_TOKEN" > "$INSTALL_MARKER"\n';
  const body = join(dir, 'source.sh'),
    marker = join(dir, 'executed');
  writeFileSync(body, installer);
  writeFileSync(
    join(bin, 'curl'),
    `#!/bin/bash
set -eu
[ "\${FAIL_DOWNLOAD:-0}" = 0 ] || exit 22
while [ "$#" -gt 0 ]; do
  if [ "$1" = --output ]; then cp "$INSTALL_SOURCE" "$2"; exit 0; fi
  shift
done
exit 2
`,
    { mode: 0o755 },
  );
  const token = "literal ' token $(touch unexpected) `printf unexpected`";
  const input = {
    token,
    exchangeUrl: 'https://example.test/exchange',
    remoteInstallScriptUrl: 'https://example.test/install.sh',
    remoteInstallScriptSha256: createHash('sha256').update(installer).digest('hex'),
  };
  const run = (digest: string, fail = '0') =>
    spawnSync(
      'bash',
      ['-c', buildRemoteInstallCommand({ ...input, remoteInstallScriptSha256: digest })],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: bin + ':' + process.env.PATH,
          TMPDIR: downloads,
          INSTALL_SOURCE: body,
          INSTALL_MARKER: marker,
          FAIL_DOWNLOAD: fail,
        },
      },
    );
  try {
    const corrupt = run('0'.repeat(64));
    assert.notEqual(corrupt.status, 0);
    assert.match(corrupt.stderr, /integrity verification failed/);
    assert.equal(existsSync(marker), false);
    assert.deepEqual(readdirSync(downloads), []);
    assert.notEqual(run(input.remoteInstallScriptSha256, '1').status, 0);
    assert.equal(existsSync(marker), false);
    assert.deepEqual(readdirSync(downloads), []);
    const valid = run(input.remoteInstallScriptSha256);
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(readFileSync(marker, 'utf8'), token);
    assert.deepEqual(readdirSync(downloads), []);
    for (const digest of [undefined, '', 'x'.repeat(64), 'a'.repeat(63)])
      assert.throws(
        () => buildRemoteInstallCommand({ ...input, remoteInstallScriptSha256: digest }),
        /SHA-256/,
      );
    for (const url of [
      'http://example.test/install.sh',
      'https://user:secret@example.test/install.sh',
    ])
      assert.throws(
        () => buildRemoteInstallCommand({ ...input, remoteInstallScriptUrl: url }),
        /HTTPS URL/,
      );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
