import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { HandoverStorage } from '../src/modules/deployment/handover-storage';
test('handover storage safely truncates an uncommitted tail and verifies ciphertext integrity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'handover-storage-'));
  try {
    const storage = new HandoverStorage(root),
      id = randomUUID();
    await storage.write(id, 0, Buffer.from('firstTAIL'));
    await storage.write(id, 5, Buffer.from('second'));
    const expected = Buffer.from('firstsecond');
    await storage.verify(id, expected.length, createHash('sha256').update(expected).digest('hex'));
    await assert.rejects(storage.verify(id, expected.length, 'a'.repeat(64)));
    await assert.rejects(storage.write(id, 99, Buffer.from('bad')));
    await storage.remove(id);
    await storage.remove(id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('handover storage rejects symlink writes and reads without modifying their target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'handover-symlink-'));
  try {
    const storage = new HandoverStorage(root),
      id = randomUUID(),
      target = join(root, 'unrelated.txt');
    await writeFile(target, 'preserved');
    await symlink(target, join(root, id + '.age'));
    await assert.rejects(storage.write(id, 0, Buffer.from('changed')));
    await assert.rejects(storage.stream(id));
    assert.equal(await readFile(target, 'utf8'), 'preserved');
    await assert.rejects(storage.write('../bad', 0, Buffer.from('bad')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
