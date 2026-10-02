import type { DbExecutor } from '../../db/types';

import { AuthRepository } from './repository';

export function createAuthAccess(db: DbExecutor) {
  const implementation = new AuthRepository(db);
  return {
    countAdmins: implementation.countAdmins.bind(implementation),
    findUserByEmail: implementation.findUserByEmail.bind(implementation),
    findUserById: implementation.findUserById.bind(implementation),
    listActiveUsers: implementation.listActiveUsers.bind(implementation),
    listUsers: implementation.listUsers.bind(implementation),
    listUsersByIds: implementation.listUsersByIds.bind(implementation),
    updatePasswordCredential: implementation.updatePasswordCredential.bind(implementation),
    updateUser: implementation.updateUser.bind(implementation),
  };
}
export type AuthRepositoryPort = ReturnType<typeof createAuthAccess>;
