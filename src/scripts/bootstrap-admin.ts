import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { loadEnv } from '../lib/env';
import { hashPassword } from '../lib/security';
import { AuthRepository } from '../modules/auth/repository';

export async function bootstrapAdmin(
  db: ReturnType<typeof drizzle<typeof schema>>,
  input: { email: string; password: string },
) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.password.length < 12)
    throw new Error('Bootstrap requires a valid email and password of at least 12 characters');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(73012401)`);
    const repository = new AuthRepository(tx);
    if (await repository.countAdmins()) return { created: false };
    if (await repository.findUserByEmail(input.email))
      throw new Error('Bootstrap cannot promote an existing public account');
    const user = await repository.createUser({ email: input.email, role: 'admin' });
    await repository.createPasswordCredential({
      userId: user.id,
      passwordHash: hashPassword(input.password),
    });
    await repository.createAuthIdentity({
      userId: user.id,
      provider: 'password',
      providerUserId: input.email,
    });
    await repository.markEmailVerified(user.id);
    return { created: true };
  });
}
async function main() {
  const env = loadEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    const result = await bootstrapAdmin(drizzle(pool, { schema }), {
      email: process.env.INITIAL_ADMIN_EMAIL ?? '',
      password: process.env.INITIAL_ADMIN_PASSWORD ?? '',
    });
    console.info(
      result.created ? 'Administrator initialized' : 'Administrator already initialized',
    );
  } finally {
    delete process.env.INITIAL_ADMIN_PASSWORD;
    await pool.end();
  }
}
if (require.main === module)
  main().catch(() => {
    console.error('Administrator bootstrap failed');
    process.exitCode = 1;
  });
