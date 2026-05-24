import test from 'node:test';
import assert from 'node:assert/strict';

import { hasPermission } from '../src/lib/rbac';

test('support role is read-only for users and cannot change roles', () => {
  assert.equal(hasPermission('support', 'users.view'), true);
  assert.equal(hasPermission('support', 'users.edit'), false);
  assert.equal(hasPermission('support', 'users.role_manage'), false);
  assert.equal(hasPermission('support', 'users.reset_password'), false);
});

test('finance role can operate order exception flow', () => {
  assert.equal(hasPermission('finance', 'orders.view'), true);
  assert.equal(hasPermission('finance', 'orders.reconcile'), true);
  assert.equal(hasPermission('finance', 'orders.cancel'), true);
  assert.equal(hasPermission('finance', 'orders.refund'), true);
});
