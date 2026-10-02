import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JobHandlerRegistry } from '../src/modules/jobs/public';
test('registry rejects invalid payloads and unknown versions before external execution', async () => {
  let invoked = 0;
  const registry = new JobHandlerRegistry().register('email.deliver', async () => {
    invoked++;
    return { ok: true };
  });
  const signal = new AbortController().signal;
  await assert.rejects(registry.run({ kind: 'email.deliver', payload: {}, meta: {} }, signal));
  await assert.rejects(
    registry.run(
      {
        kind: 'email.deliver',
        payload: { to: 'u@example.test', subject: 'test', text: 'test' },
        meta: { payloadVersion: 2 },
      },
      signal,
    ),
  );
  assert.equal(invoked, 0);
  assert.deepEqual(
    await registry.run(
      {
        kind: 'email.deliver',
        payload: { to: 'u@example.test', subject: 'test', text: 'test' },
        meta: {},
      },
      signal,
    ),
    { ok: true },
  );
  assert.equal(invoked, 1);
});
test('registry honors cancellation and refuses duplicate handlers', async () => {
  const registry = new JobHandlerRegistry().register('billing.refund.reconcile', async () => ({
    ok: true,
  }));
  assert.throws(() => registry.register('billing.refund.reconcile', async () => ({})));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    registry.run(
      { kind: 'billing.refund.reconcile', payload: { orderNo: 'fixture' }, meta: {} },
      controller.signal,
    ),
  );
});
