import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactAuditValue } from '../src/modules/audit/public';
test('audit redaction removes nested credentials, payloads and raw exceptions', () => {
  const projection = redactAuditValue({
    action: 'fixture',
    password: 'fixture-secret',
    nested: {
      authorization: 'fixture-secret',
      payload: { token: 'fixture-secret' },
      error: 'fixture-secret',
    },
    count: 3,
  });
  assert(!JSON.stringify(projection).includes('fixture-secret'));
  assert.equal(projection.count, 3);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.doesNotThrow(() => redactAuditValue(cyclic));
});
