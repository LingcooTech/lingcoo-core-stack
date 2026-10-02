import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, (error, value) => (error ? reject(error) : resolve(value))),
  );
}
export async function hashPasswordAsync(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `${SCRYPT_PREFIX}$${salt}$${(await derivePassword(password, salt)).toString('hex')}`;
}
export async function verifyPasswordAsync(password: string, encodedHash: string): Promise<boolean> {
  const [prefix, salt, stored] = encodedHash.split('$');
  if (prefix !== SCRYPT_PREFIX || !salt || !stored || !/^[0-9a-f]{128}$/i.test(stored))
    return false;
  return timingSafeEqual(Buffer.from(stored, 'hex'), await derivePassword(password, salt));
}

const SCRYPT_PREFIX = 'scrypt';
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');

  return `${SCRYPT_PREFIX}$${salt}$${hash}`;
}

export function verifyPassword(password: string, encodedHash: string): boolean {
  const [prefix, salt, storedHash] = encodedHash.split('$');

  if (prefix !== SCRYPT_PREFIX || !salt || !storedHash) {
    return false;
  }

  const derivedHash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  if (!/^[0-9a-f]{128}$/i.test(storedHash)) return false;
  return timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(derivedHash, 'hex'));
}
