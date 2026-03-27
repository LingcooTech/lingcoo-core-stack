import { eq } from 'drizzle-orm';

import { authIdentities, passwordCredentials, users } from '../../db/schema';
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
}
