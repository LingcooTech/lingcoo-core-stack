import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { and, eq, lte, inArray, ne } from 'drizzle-orm';
import { idempotencyRequests } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { encryptJson, decryptJson, getEncryptionKeys } from '../../lib/settings-crypto';
export function canonicalPayload(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalPayload).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonicalPayload(item))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export class IdempotencyService {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
  ) {}
  async begin(input: { principal: string; command: string; key: string; payload: unknown }) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(input.key))
      throw httpError(400, 'Invalid Idempotency-Key');
    const scopeDigest = digest(canonicalPayload([input.principal, input.command, input.key]));
    const payloadDigest = digest(scopeDigest + canonicalPayload(input.payload));
    const ownerToken = randomUUID(),
      now = new Date();
    const [created] = await this.db
      .insert(idempotencyRequests)
      .values({
        scopeDigest,
        payloadDigest,
        ownerToken,
        status: 'processing',
        expiresAt: new Date(now.getTime() + 86400000),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: idempotencyRequests.scopeDigest })
      .returning();
    if (created) return { kind: 'claimed' as const, id: created.id, ownerToken };
    for (let attempt = 0; attempt < 50; attempt++) {
      const [existing] = await this.db
        .select()
        .from(idempotencyRequests)
        .where(eq(idempotencyRequests.scopeDigest, scopeDigest))
        .limit(1);
      if (!existing) throw httpError(409, 'Request reservation is unavailable');
      if (existing.payloadDigest !== payloadDigest)
        throw httpError(409, 'Idempotency-Key was used with a different payload');
      if (existing.expiresAt.getTime() <= Date.now())
        throw httpError(
          409,
          'Request key expired; inspect the previous operation before starting a new command',
        );
      if (existing.status !== 'processing') {
        if (!existing.result || !existing.responseStatus)
          throw httpError(409, 'Request outcome requires reconciliation');
        return {
          kind: 'replay' as const,
          status: existing.responseStatus,
          body: decryptJson(existing.result, getEncryptionKeys(this.env)),
        };
      }
      await delay(100);
    }
    throw httpError(409, 'Request is in progress or requires reconciliation');
  }
  async finish(claim: { id: string; ownerToken: string }, status: number, body: unknown) {
    await this.db
      .update(idempotencyRequests)
      .set({
        status: status >= 500 ? 'unknown' : status >= 400 ? 'failed' : 'succeeded',
        responseStatus: status,
        result: encryptJson(body, getEncryptionKeys(this.env)),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(idempotencyRequests.id, claim.id),
          eq(idempotencyRequests.ownerToken, claim.ownerToken),
          eq(idempotencyRequests.status, 'processing'),
        ),
      );
  }
}

export async function rotateIdempotencyKeyring(db: DbExecutor, env: AppEnv, dryRun: boolean) {
  const keyring = getEncryptionKeys(env);
  let checked = 0,
    rotated = 0;
  const rows = await db.select().from(idempotencyRequests).for('update');
  for (const row of rows) {
    if (!row.result) continue;
    checked++;
    const envelope = row.result as { version?: number; keyId?: string };
    const plain = decryptJson(row.result, keyring);
    if (envelope.version === 2 && envelope.keyId === keyring.currentKeyId) continue;
    rotated++;
    if (!dryRun)
      await db
        .update(idempotencyRequests)
        .set({ result: encryptJson(plain, keyring), updatedAt: new Date() })
        .where(eq(idempotencyRequests.id, row.id));
  }
  return { checked, rotated };
}

export async function pruneIdempotencyResults(db: DbExecutor) {
  const expired = await db
    .select({ id: idempotencyRequests.id })
    .from(idempotencyRequests)
    .where(
      and(
        lte(idempotencyRequests.expiresAt, new Date()),
        ne(idempotencyRequests.status, 'expired'),
      ),
    )
    .limit(1000);
  if (expired.length)
    await db
      .update(idempotencyRequests)
      .set({ result: null, status: 'expired', updatedAt: new Date() })
      .where(
        inArray(
          idempotencyRequests.id,
          expired.map((row) => row.id),
        ),
      );
  return expired.length;
}
