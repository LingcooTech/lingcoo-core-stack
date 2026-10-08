export type AppRole = 'user' | 'support' | 'finance' | 'editor' | 'operator' | 'admin';

export type AppPermission =
  | 'dashboard.view'
  | 'apps.manage'
  | 'content.manage'
  | 'docs.manage'
  | 'orders.view'
  | 'orders.reconcile'
  | 'orders.cancel'
  | 'orders.refund'
  | 'payments.manage'
  | 'settings.manage'
  | 'users.view'
  | 'users.edit'
  | 'users.role_manage'
  | 'users.suspend'
  | 'users.reset_password'
  | 'licenses.manage'
  | 'deployments.view'
  | 'hosting.terms.manage'
  | 'hosting.offers.manage'
  | 'installs.view'
  | 'tickets.manage'
  | 'notifications.manage'
  | 'jobs.manage'
  | 'observability.view'
  | 'ai.manage';

const allPermissions: AppPermission[] = [
  'dashboard.view',
  'apps.manage',
  'content.manage',
  'docs.manage',
  'orders.view',
  'orders.reconcile',
  'orders.cancel',
  'orders.refund',
  'payments.manage',
  'settings.manage',
  'users.view',
  'users.edit',
  'users.role_manage',
  'users.suspend',
  'users.reset_password',
  'licenses.manage',
  'installs.view',
  'deployments.view',
  'hosting.terms.manage',
  'hosting.offers.manage',
  'tickets.manage',
  'notifications.manage',
  'observability.view',
  'jobs.manage',
  'ai.manage',
];

export const roleLabels: Record<AppRole, string> = {
  user: '普通用户',
  support: '客服',
  finance: '财务',
  editor: '内容编辑',
  operator: '运营',
  admin: '管理员',
};

export const rolePermissions: Record<AppRole, AppPermission[]> = {
  user: [],
  support: [
    'dashboard.view',
    'orders.view',
    'users.view',
    'licenses.manage',
    'installs.view',
    'deployments.view',
    'tickets.manage',
    'notifications.manage',
    'observability.view',
  ],
  finance: [
    'dashboard.view',
    'orders.view',
    'orders.reconcile',
    'orders.cancel',
    'orders.refund',
    'payments.manage',
    'licenses.manage',
    'observability.view',
  ],
  editor: ['dashboard.view', 'content.manage', 'docs.manage', 'notifications.manage'],
  operator: [
    'dashboard.view',
    'apps.manage',
    'payments.manage',
    'settings.manage',
    'installs.view',
    'deployments.view',
    'observability.view',
    'ai.manage',
  ],
  admin: allPermissions,
};

export function normalizeRole(value: unknown): AppRole {
  if (typeof value !== 'string') {
    return 'user';
  }

  const normalized = value.trim() as AppRole;
  return normalized in rolePermissions ? normalized : 'user';
}

export function hasPermission(role: AppRole, permission: AppPermission) {
  return rolePermissions[normalizeRole(role)].includes(permission);
}

export function canAccessAdminConsole(role: AppRole) {
  return normalizeRole(role) !== 'user';
}
