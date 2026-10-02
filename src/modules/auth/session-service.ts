import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { authSessions, users } from '../../db/schema';
import type { DbExecutor } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';

export const SESSION_COOKIE = 'fd_core_session';
export const CSRF_COOKIE = 'fd_core_csrf';
export const sessionDigest = (value: string) => createHash('sha256').update(value).digest('hex');
export function matchesSessionDigest(value: string, expected: string): boolean {
  const actual = Buffer.from(sessionDigest(value), 'hex');
  const stored = Buffer.from(expected, 'hex');
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}
export function publicAuthUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    emailVerified: user.emailVerified,
  };
}

export class AuthSessionService {
  constructor(
    private readonly db: DbExecutor,
    private readonly env: AppEnv,
  ) {}

  async create(user: typeof users.$inferSelect) {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.env.AUTH_SESSION_TTL_SECONDS * 1000);
    const session = await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(users).where(eq(users.id, user.id)).for('update');
      if (!current || current.status !== 'active' || current.authVersion !== user.authVersion)
        throw httpError(401, 'Credentials changed; sign in again');
      // Limit retained records to avoid an unbounded session history per account.
      await tx
        .delete(authSessions)
        .where(
          and(
            eq(authSessions.userId, user.id),
            or(
              lt(authSessions.expiresAt, new Date()),
              lt(authSessions.revokedAt, new Date(Date.now() - 86400000)),
            ),
          ),
        );
      const active = await tx
        .select({ id: authSessions.id })
        .from(authSessions)
        .where(and(eq(authSessions.userId, user.id), isNull(authSessions.revokedAt)));
      if (active.length >= 64)
        throw httpError(429, 'Too many active sessions; revoke a session first');
      const [created] = await tx
        .insert(authSessions)
        .values({
          userId: user.id,
          authVersion: user.authVersion,
          tokenDigest: sessionDigest(token),
          csrfDigest: sessionDigest(csrfToken),
          expiresAt,
        })
        .returning();
      if (!created) throw httpError(500, 'Session creation failed');
      return created;
    });
    return {
      token,
      csrfToken,
      session: { id: session.id, expiresAt: expiresAt.toISOString() },
      user: publicAuthUser(user),
    };
  }

  async resolve(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const [record] = await this.db
      .select({ session: authSessions, user: users })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(
        and(
          eq(authSessions.tokenDigest, sessionDigest(token)),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, new Date()),
          eq(users.status, 'active'),
          eq(authSessions.authVersion, users.authVersion),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async list(userId: string, currentId?: string) {
    const rows = await this.db
      .select({
        id: authSessions.id,
        createdAt: authSessions.createdAt,
        expiresAt: authSessions.expiresAt,
      })
      .from(authSessions)
      .where(
        and(
          eq(authSessions.userId, userId),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, new Date()),
        ),
      );
    return {
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        current: row.id === currentId,
      })),
    };
  }

  async revoke(userId: string, sessionId: string) {
    const [row] = await this.db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(authSessions.id, sessionId),
          eq(authSessions.userId, userId),
          isNull(authSessions.revokedAt),
        ),
      )
      .returning({ id: authSessions.id });
    if (!row) throw httpError(404, 'Session not found');
    return { revoked: true };
  }
}
