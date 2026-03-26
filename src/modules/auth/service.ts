import type { DbClient } from '../../db/types';
import { httpError } from '../../lib/errors';
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
  constructor(private readonly db: DbClient) {}

  async register(input: RegisterInput) {
    const existing = await new AuthRepository(this.db).findUserByEmail(input.email);

    if (existing) {
      throw httpError(409, 'Email is already registered');
    }

    const user = await this.db.transaction(async (tx) => {
      const repository = new AuthRepository(tx);
      const createdUser = await repository.createUser({
        email: input.email,
        displayName: input.displayName
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
          provider: 'password'
        }
      });

      return createdUser;
    });

    return user;
  }

  async login(input: LoginInput) {
    const repository = new AuthRepository(this.db);
    const user = await repository.findUserByEmail(input.email);

    if (!user) {
      throw httpError(401, 'Invalid email or password');
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
