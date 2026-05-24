import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMailDedupeKey, computeJobBackoffMs } from '../src/lib/job-runs';

test('computeJobBackoffMs grows exponentially and is capped', () => {
  assert.equal(computeJobBackoffMs(1), 30_000);
  assert.equal(computeJobBackoffMs(2), 60_000);
  assert.equal(computeJobBackoffMs(3), 120_000);
  assert.equal(computeJobBackoffMs(10), 15 * 60_000);
});

test('buildMailDedupeKey normalizes stable fields', () => {
  const left = buildMailDedupeKey({
    scope: ' auth.verify_email ',
    recipient: 'User@Example.com ',
    subject: ' Verify ',
    reference: ' abc ',
  });
  const right = buildMailDedupeKey({
    scope: 'auth.verify_email',
    recipient: 'user@example.com',
    subject: 'Verify',
    reference: 'abc',
  });

  assert.equal(left, right);
  assert.equal(left, 'mail:auth.verify_email:user@example.com:Verify:abc');
});
