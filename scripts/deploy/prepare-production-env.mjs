import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, chmodSync, statSync, chownSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export function prepareProductionEnv(file, env, validate) {
  const missingKey = !env.SETTINGS_ENCRYPTION_KEYS && !env.SETTINGS_ENCRYPTION_KEY?.trim();
  const key = missingKey ? randomBytes(32).toString('hex') : env.SETTINGS_ENCRYPTION_KEY;
  // Validate all existing production settings before changing any file.
  validate({
    ...env,
    NODE_ENV: 'production',
    SETTINGS_ENCRYPTION_KEY: key,
    ...(missingKey ? { ALLOW_LEGACY_SETTINGS_DECRYPTION: 'true' } : {}),
  });
  if (!missingKey) return false;
  const original = readFileSync(file, 'utf8');
  const line = `SETTINGS_ENCRYPTION_KEY=${key}`;
  const pattern = /^\s*(?:export\s+)?SETTINGS_ENCRYPTION_KEY\s*=.*$/gm;
  let updated = pattern.test(original)
    ? original.replace(pattern, line)
    : original.replace(/\n?$/, '\n') + line + '\n';
  const legacyPattern = /^\s*(?:export\s+)?ALLOW_LEGACY_SETTINGS_DECRYPTION\s*=.*$/gm;
  const legacyLine = 'ALLOW_LEGACY_SETTINGS_DECRYPTION=true';
  updated = legacyPattern.test(updated)
    ? updated.replace(legacyPattern, legacyLine)
    : updated.replace(/\n?$/, '\n') + legacyLine + '\n';
  const { uid, gid } = statSync(file);
  const temporary = file + '.release-pending';
  writeFileSync(temporary, updated, { mode: 0o600, flag: 'wx' });
  chownSync(temporary, uid, gid);
  chmodSync(temporary, 0o600);
  renameSync(temporary, file);
  return true;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const require = createRequire(import.meta.url);
    const { validateEnv } = require('../../dist/lib/env.js');
    const created = prepareProductionEnv('/release/.env', process.env, validateEnv);
    console.info(
      created
        ? 'Independent settings key initialized; legacy reads preserved'
        : 'Production settings validated',
    );
  } catch {
    console.error(
      'Production settings preflight failed; existing configuration and services retained',
    );
    process.exitCode = 1;
  }
}
