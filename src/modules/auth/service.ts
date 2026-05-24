import { randomInt } from 'node:crypto';

import type { DbClient } from '../../db/types';
import type { AppEnv } from '../../lib/env';
import { httpError } from '../../lib/errors';
import { JobRunService } from '../../lib/job-runs';
import { Mailer } from '../../lib/mailer';
import { hashPassword, verifyPassword } from '../../lib/security';
import { SmtpSettingsService } from '../../lib/smtp-settings';
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
    private readonly env?: AppEnv,
  ) {}

  private generateVerificationCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private async createMailer() {
    if (!this.env) {
      return new Mailer();
    }

    const config = await new SmtpSettingsService(this.db, this.env).getRuntimeSettings();
    return new Mailer(
      config && config.password
        ? {
            host: config.host,
            port: config.port,
            secure: config.secure,
            user: config.user,
            password: config.password,
            from: config.from,
          }
        : null,
    );
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

    const mailer = await this.createMailer();
    if (mailer.isConfigured) {
      if (!this.env) {
        await mailer.send({
          to: email,
          subject: 'Email Verification Code',
          text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`,
          html: `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`,
        });
      } else {
        await new JobRunService(this.db, this.env).enqueueMail(
          {
            to: email,
            subject: 'Email Verification Code',
            text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`,
            html: `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`,
          },
          {
            scope: 'auth.verify_email',
            reference: `${userId}:${code}`,
            createdByUserId: userId,
            relatedEntityType: 'user',
            relatedEntityId: userId,
          },
        );
      }
      return { sent: true };
    }

    return { sent: false };
  }

  async verifyEmail(userId: string, code: string) {
    const repository = new AuthRepository(this.db);
    const record = await repository.findActiveVerificationCode(userId, code);

    if (!record) {
      throw httpError(400, 'Invalid or expired verification code');
    }

    const user = await repository.markEmailVerified(userId);
    await repository.deleteVerificationCodes(userId);

    await new EventService(this.db).capture({
      userId,
      eventName: 'auth.email_verified',
      properties: {},
    });

    if (!user) {
      throw httpError(404, 'User not found');
    }

    return { verified: true, user };
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
        source: 'bootstrap',
      },
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
        role,
      });

      await repository.createPasswordCredential({
        userId: createdUser.id,
        passwordHash: hashPassword(input.password),
      });

      await repository.createAuthIdentity({
        userId: createdUser.id,
        provider: 'password',
        providerUserId: input.email,
      });

      await new EventService(tx).capture({
        userId: createdUser.id,
        eventName: 'auth.registered',
        properties: {
          provider: 'password',
          role,
        },
      });

      return createdUser;
    });

    // If mailer is configured, send verification code; otherwise auto-verify
    const mailerConfigured = (await this.createMailer()).isConfigured;

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
        provider: 'password',
      },
    });

    user = (await this.ensureBootstrapAdmin(user.id)) ?? user;

    return user;
  }

  async requestPasswordReset(email: string) {
    const repository = new AuthRepository(this.db);
    const mailer = await this.createMailer();

    if (!mailer.isConfigured) {
      throw httpError(503, 'Password reset email is not configured');
    }

    const user = await repository.findUserByEmail(email);
    if (!user) {
      return { sent: true };
    }

    const latest = await repository.findLatestPasswordResetCode(user.id);
    if (latest) {
      const elapsed = Date.now() - latest.createdAt.getTime();
      if (elapsed < 60_000) {
        throw httpError(429, 'Please wait before requesting another reset code');
      }
    }

    const code = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await repository.createPasswordResetCode(user.id, code, expiresAt);
    if (!this.env) {
      await mailer.send({
        to: user.email,
        subject: 'Password Reset Code',
        text: `Your password reset code is: ${code}\n\nThis code expires in 10 minutes.`,
        html: `<p>Your password reset code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`,
      });
    } else {
      await new JobRunService(this.db, this.env).enqueueMail(
        {
          to: user.email,
          subject: 'Password Reset Code',
          text: `Your password reset code is: ${code}\n\nThis code expires in 10 minutes.`,
          html: `<p>Your password reset code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`,
        },
        {
          scope: 'auth.password_reset',
          reference: `${user.id}:${code}`,
          createdByUserId: user.id,
          relatedEntityType: 'user',
          relatedEntityId: user.id,
        },
      );
    }

    await new EventService(this.db).capture({
      userId: user.id,
      eventName: 'auth.password_reset_requested',
      properties: {},
    });

    return { sent: true };
  }

  async resetPassword(input: { email: string; code: string; newPassword: string }) {
    const repository = new AuthRepository(this.db);
    const user = await repository.findUserByEmail(input.email);

    if (!user) {
      throw httpError(400, 'Invalid or expired reset code');
    }

    const record = await repository.findActivePasswordResetCode(user.id, input.code);
    if (!record) {
      throw httpError(400, 'Invalid or expired reset code');
    }

    await repository.upsertPasswordCredential(user.id, hashPassword(input.newPassword));
    await repository.deletePasswordResetCodes(user.id);

    await new EventService(this.db).capture({
      userId: user.id,
      eventName: 'auth.password_reset_completed',
      properties: {},
    });

    return { reset: true };
  }

  async updateCurrentUser(userId: string, input: { displayName?: string | null }) {
    const repository = new AuthRepository(this.db);
    const user = await repository.findUserById(userId);

    if (!user) {
      throw httpError(404, 'User not found');
    }

    const updatedUser = await repository.updateUser(userId, {
      displayName: input.displayName,
    });

    if (!updatedUser) {
      throw httpError(500, 'Failed to update user profile');
    }

    await new EventService(this.db).capture({
      userId,
      eventName: 'auth.profile_updated',
      properties: {
        displayName: updatedUser.displayName,
      },
    });

    return updatedUser;
  }

  async changePassword(userId: string, input: { currentPassword: string; newPassword: string }) {
    const repository = new AuthRepository(this.db);
    const user = await repository.findUserById(userId);

    if (!user) {
      throw httpError(404, 'User not found');
    }

    const credential = await repository.findPasswordCredentialByUserId(userId);
    if (!credential || !verifyPassword(input.currentPassword, credential.passwordHash)) {
      throw httpError(400, 'Current password is incorrect');
    }

    await repository.updatePasswordCredential(userId, hashPassword(input.newPassword));
    await repository.deletePasswordResetCodes(userId);

    await new EventService(this.db).capture({
      userId,
      eventName: 'auth.password_changed',
      properties: {},
    });

    return { changed: true };
  }

  async getUserById(userId: string) {
    const user = await new AuthRepository(this.db).findUserById(userId);

    if (!user) {
      throw httpError(404, 'User not found');
    }

    return user;
  }
}
