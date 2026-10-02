import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { httpError } from './errors';
import type { AppEnv } from './env';

export type EncryptionKeyring = {
  currentKeyId: string;
  keys: Record<string, string>;
  legacySecrets: string[];
};
type EncryptionMaterial = string | EncryptionKeyring;

export function getEncryptionKeys(env: AppEnv): EncryptionKeyring {
  const keys = env.SETTINGS_ENCRYPTION_KEYS
    ? (JSON.parse(env.SETTINGS_ENCRYPTION_KEYS) as Record<string, string>)
    : { primary: env.SETTINGS_ENCRYPTION_KEY?.trim() || env.JWT_SECRET };
  const currentKeyId = env.SETTINGS_ENCRYPTION_CURRENT_KEY_ID || 'primary';
  if (!keys[currentKeyId]) throw httpError(500, 'Settings encryption key is unavailable');
  const legacySecrets =
    env.ALLOW_LEGACY_SETTINGS_DECRYPTION === false
      ? []
      : [
          ...new Set(
            [
              env.SETTINGS_ENCRYPTION_LEGACY_KEY,
              env.SETTINGS_ENCRYPTION_KEY,
              env.JWT_SECRET,
              ...Object.values(keys),
            ].filter((key): key is string => Boolean(key)),
          ),
        ];
  return { currentKeyId, keys, legacySecrets };
}

type EncryptedEnvelope = {
  version: 1 | 2;
  keyId?: string;
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  data: string;
};

function deriveKey(secret: string) {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptJson(value: unknown, material: EncryptionMaterial): EncryptedEnvelope {
  const keyId = typeof material === 'string' ? undefined : material.currentKeyId;
  const secret = typeof material === 'string' ? material : material.keys[material.currentKeyId];
  if (!secret) throw httpError(500, 'Settings encryption key is unavailable');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: keyId ? 2 : 1,
    ...(keyId ? { keyId } : {}),
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

export function decryptJson<T>(value: unknown, material: EncryptionMaterial): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(500, 'Encrypted setting payload is invalid');
  }

  const envelope = value as Partial<EncryptedEnvelope>;
  if (
    ![1, 2].includes(envelope.version ?? 0) ||
    envelope.alg !== 'aes-256-gcm' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.tag !== 'string' ||
    typeof envelope.data !== 'string'
  ) {
    throw httpError(500, 'Encrypted setting payload format is invalid');
  }

  const secrets =
    typeof material === 'string'
      ? [material]
      : envelope.version === 2
        ? [material.keys[envelope.keyId ?? '']].filter((secret): secret is string =>
            Boolean(secret),
          )
        : material.legacySecrets;
  for (const secret of secrets) {
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        deriveKey(secret),
        Buffer.from(envelope.iv, 'base64'),
      );

      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(envelope.data, 'base64')),
        decipher.final(),
      ]).toString('utf8');

      return JSON.parse(decrypted) as T;
    } catch {
      /* Try only explicitly retained legacy keys. */
    }
  }
  throw httpError(500, 'Failed to decrypt system setting');
}
