import { randomInt } from 'node:crypto';

import type { DbClient } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { Mailer } from '../../lib/mailer';
import { hashPassword, verifyPassword } from '../../lib/security';
import { EventService } from '../event/service';
import { AuthRepository } from './repository';

type RegisterInput = {
  email: string;
  password: string;
  displayName?: string;
};

type LoginInput = {
  email: string;
  password: string;
};

export class AuthService {
  constructor(
    private readonly db: DbClient,
    private readonly env?: AppEnv
  ) {}

  private generateVerificationCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  async sendVerificationCode(userId: string, email: string) {
    const repository = new AuthRepository(this.db);

    // Rate limit: 60 seconds between codes
    const latest = await repository.findLatestVerificationCode(userId);
    if (latest) {
      const elapsed = Date.now() - latest.createdAt.getTime();
      if (elapsed < 60_000) {
        throw httpError(429, 'Please wait before requesting a new verification code');
      }
    }

    const code = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await repository.createVerificationCode(userId, code, expiresAt);

    if (this.env) {
      const mailer = new Mailer(this.env);
      if (mailer.isConfigured) {
        await mailer.send({
          to: email,
          subject: 'Email Verification Code',
          text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`,
          html: `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`
        });
        return { sent: true };
      }
    }

    return { sent: false };
  }

  async verifyEmail(userId: string, code: string) {
    const repository = new AuthRepository(this.db);
    const record = await repository.findActiveVerificationCode(userId, code);

    if (!record) {
      throw httpError(400, 'Invalid or expired verification code');
    }

    await repository.markEmailVerified(userId);
    await repository.deleteVerificationCodes(userId);

    await new EventService(this.db).capture({
      userId,
      eventName: 'auth.email_verified',
      properties: {}
    });

    return { verified: true };
  }

  private async ensureBootstrapAdmin(userId: string) {
    const repository = new AuthRepository(this.db);
    const adminCount = await repository.countAdmins();

    if (adminCount > 0) {
      return repository.findUserById(userId);
    }

    const promotedUser = await repository.updateUserRole(userId, 'admin');

    if (!promotedUser) {
      throw httpError(500, 'Failed to grant bootstrap admin role');
    }

    await new EventService(this.db).capture({
      userId: promotedUser.id,
      eventName: 'auth.admin_bootstrapped',
      properties: {
        source: 'bootstrap'
      }
    });

    return promotedUser;
  }

  async register(input: RegisterInput) {
    const existing = await new AuthRepository(this.db).findUserByEmail(input.email);

    if (existing) {
      throw httpError(409, 'Email is already registered');
    }

    const user = await this.db.transaction(async (tx) => {
      const repository = new AuthRepository(tx);
      const role = (await repository.countAdmins()) === 0 ? 'admin' : 'user';
      const createdUser = await repository.createUser({
        email: input.email,
        displayName: input.displayName,
        role
      });

      await repository.createPasswordCredential({
        userId: createdUser.id,
        passwordHash: hashPassword(input.password)
      });

      await repository.createAuthIdentity({
        userId: createdUser.id,
        provider: 'password',
        providerUserId: input.email
      });

      await new EventService(tx).capture({
        userId: createdUser.id,
        eventName: 'auth.registered',
        properties: {
          provider: 'password',
          role
        }
      });

      return createdUser;
    });

    // If mailer is configured, send verification code; otherwise auto-verify
    let mailerConfigured = false;
    if (this.env) {
      const mailer = new Mailer(this.env);
      mailerConfigured = mailer.isConfigured;
    }

    if (mailerConfigured) {
      try {
        await this.sendVerificationCode(user.id, user.email);
      } catch {
        // Non-fatal: user can resend later
      }
    } else {
      // Auto-verify if mailer is not configured
      await new AuthRepository(this.db).markEmailVerified(user.id);
      const updated = await new AuthRepository(this.db).findUserById(user.id);
      if (updated) return updated;
    }

    return user;
  }

  async login(input: LoginInput) {
    const repository = new AuthRepository(this.db);
    let user = await repository.findUserByEmail(input.email);

    if (!user) {
      throw httpError(401, 'Invalid email or password');
    }

    if (user.status === 'suspended') {
      throw httpError(403, 'Your account has been suspended');
    }

    const credential = await repository.findPasswordCredentialByUserId(user.id);
    if (!credential || !verifyPassword(input.password, credential.passwordHash)) {
      throw httpError(401, 'Invalid email or password');
    }

    await new EventService(this.db).capture({
      userId: user.id,
      eventName: 'auth.logged_in',
      properties: {
        provider: 'password'
      }
    });

    user = (await this.ensureBootstrapAdmin(user.id)) ?? user;

    return user;
  }

  async getUserById(userId: string) {
    const user = await new AuthRepository(this.db).findUserById(userId);

    if (!user) {
      throw httpError(404, 'User not found');
    }

    return user;
  }
}
