import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTimeout, withAbort } from '../src/runtime/lifecycle';
test('runtime deadlines and cancellation bound non-cooperative work', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 20), /timed out/);
  const controller = new AbortController();
  const task = withAbort(new Promise(() => {}), controller.signal);
  controller.abort();
  await assert.rejects(task, /aborted/);
  await assert.rejects(
    withAbort(Promise.reject(new Error('late handler failure')), controller.signal),
    /aborted/,
  );
});
