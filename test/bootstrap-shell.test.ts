import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
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
    installPath: value,
    repoBranch: value,
  });
  assert.equal(spawnSync('bash', ['-n'], { input: command }).status, 0);
  assert.equal(
    spawnSync('bash', ['-n'], { input: buildExchangeCurl(value, 'https://example.test') }).status,
    0,
  );
});
