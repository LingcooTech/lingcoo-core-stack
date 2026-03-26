import { eq } from 'drizzle-orm';

import { authIdentities, passwordCredentials, users } from '../../db/schema';
import type { DbExecutor } from '../../db/types';

export class AuthRepository {
  constructor(private readonly db: DbExecutor) {}

  async findUserByEmail(email: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return user ?? null;
  }

  async findUserById(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user ?? null;
  }

  async createUser(input: { email: string; displayName?: string }) {
    const [user] = await this.db
      .insert(users)
      .values({
        email: input.email,
        displayName: input.displayName ?? null
      })
      .returning();

    return user;
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
