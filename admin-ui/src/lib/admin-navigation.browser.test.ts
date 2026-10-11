import { expect, test } from 'vitest';
import { adminReturnPath } from './admin-navigation';

test('settings return navigation preserves local filters and rejects external or looping destinations', () => {
  expect(adminReturnPath('/admin/storage?folder=images#selection')).toBe(
    '/admin/storage?folder=images#selection',
  );
  expect(adminReturnPath('/admin/apps/retail/edit')).toBe('/admin/apps/retail/edit');
  for (const value of [
    null,
    '//evil.test/admin/storage',
    'https://evil.test',
    '/admin/../../login',
    '/admin/\\evil.test',
    '/admin/settings?tab=site',
  ]) {
    expect(adminReturnPath(value)).toBeUndefined();
  }
});
