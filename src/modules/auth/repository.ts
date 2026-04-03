import { and, desc, eq, gt, ilike, inArray, or, sql } from 'drizzle-orm';

import { authIdentities, emailVerificationCodes, passwordCredentials, users } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class AuthRepository {
  constructor(private readonly db: DbExecutor) {}

  async countAdmins() {
    const rows = await this.db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
    return rows.length;
  }

  async findUserByEmail(email: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return user ?? null;
  }

  async findUserById(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user ?? null;
  }

  async listUsersByIds(userIds: string[]) {
    if (userIds.length === 0) {
      return [];
    }

    return this.db.select().from(users).where(inArray(users.id, userIds));
  }

  async createUser(input: { email: string; displayName?: string; role?: 'user' | 'admin' }) {
    const [user] = await this.db
      .insert(users)
      .values({
        email: input.email,
        displayName: input.displayName ?? null,
        role: input.role ?? 'user'
      })
      .returning();

    return user;
  }

  async updateUserRole(userId: string, role: 'user' | 'admin') {
    const [user] = await this.db
      .update(users)
      .set({
        role,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();

    return user ?? null;
  }

  async createPasswordCredential(input: { userId: string; passwordHash: string }) {
    const [credential] = await this.db
      .insert(passwordCredentials)
      .values({
        userId: input.userId,
        passwordHash: input.passwordHash
      })
      .returning();

    return credential;
  }

  async findPasswordCredentialByUserId(userId: string) {
    const [credential] = await this.db
      .select()
      .from(passwordCredentials)
      .where(eq(passwordCredentials.userId, userId))
      .limit(1);

    return credential ?? null;
  }

  async createAuthIdentity(input: { userId: string; provider: string; providerUserId: string }) {
    const [identity] = await this.db
      .insert(authIdentities)
      .values(input)
      .returning();

    return identity;
  }

  // ─── Email Verification ──────────────────────────────────────────────────

  async createVerificationCode(userId: string, code: string, expiresAt: Date) {
    await this.db
      .delete(emailVerificationCodes)
      .where(eq(emailVerificationCodes.userId, userId));

    const [record] = await this.db
      .insert(emailVerificationCodes)
      .values({ userId, code, expiresAt })
      .returning();

    return record;
  }

  async findActiveVerificationCode(userId: string, code: string) {
    const [record] = await this.db
      .select()
      .from(emailVerificationCodes)
      .where(
        and(
          eq(emailVerificationCodes.userId, userId),
          eq(emailVerificationCodes.code, code),
          gt(emailVerificationCodes.expiresAt, new Date())
        )
      )
      .limit(1);

    return record ?? null;
  }

  async findLatestVerificationCode(userId: string) {
    const [record] = await this.db
      .select()
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.userId, userId))
      .orderBy(desc(emailVerificationCodes.createdAt))
      .limit(1);

    return record ?? null;
  }

  async deleteVerificationCodes(userId: string) {
    await this.db
      .delete(emailVerificationCodes)
      .where(eq(emailVerificationCodes.userId, userId));
  }

  async markEmailVerified(userId: string) {
    const now = new Date();
    const [user] = await this.db
      .update(users)
      .set({
        emailVerified: true,
        emailVerifiedAt: now,
        updatedAt: now
      })
      .where(eq(users.id, userId))
      .returning();

    return user ?? null;
  }

  // ─── General User Management ─────────────────────────────────────────────

  async updateUser(
    userId: string,
    input: { displayName?: string; role?: 'user' | 'admin'; status?: 'active' | 'suspended' }
  ) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (input.displayName !== undefined) set.displayName = input.displayName;
    if (input.role !== undefined) set.role = input.role;
    if (input.status !== undefined) set.status = input.status;

    const [user] = await this.db
      .update(users)
      .set(set)
      .where(eq(users.id, userId))
      .returning();

    return user ?? null;
  }

  async updatePasswordCredential(userId: string, passwordHash: string) {
    const [credential] = await this.db
      .update(passwordCredentials)
      .set({
        passwordHash,
        updatedAt: new Date()
      })
      .where(eq(passwordCredentials.userId, userId))
      .returning();

    return credential ?? null;
  }

  async listUsers(query: {
    limit: number;
    offset: number;
    search?: string;
    role?: 'user' | 'admin';
    status?: 'active' | 'suspended';
  }) {
    const conditions = [];

    if (query.role) {
      conditions.push(eq(users.role, query.role));
    }

    if (query.status) {
      conditions.push(eq(users.status, query.status));
    }

    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(ilike(users.email, pattern), ilike(users.displayName, pattern))!
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await Promise.all([
      this.db
        .select()
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(where)
    ]);

    return {
      items,
      total: countResult[0]?.count ?? 0
    };
  }
}
