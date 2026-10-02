import {
  canAccessAdminConsole,
  hasAnyPermission,
  normalizeRole,
  type AppPermission,
} from '../../lib/rbac';
import { httpError } from '../../lib/errors';
export function requireUserPrincipal(
  user: { id: string; status: string } | null,
  token: { kind?: string; sub: string },
) {
  if (token.kind === 'app' || !user || user.id !== token.sub || user.status !== 'active')
    throw httpError(401, 'User is unavailable');
  return { kind: 'user' as const, userId: user.id };
}
export function requirePermissions(role: string, permissions: AppPermission[]) {
  const normalized = normalizeRole(role);
  if (!canAccessAdminConsole(normalized) || !hasAnyPermission(normalized, permissions))
    throw httpError(403, 'Insufficient permission');
}
