import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectViolations, checkBoundaries } from '../scripts/check-module-boundaries.mjs';
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'stack-boundaries-'));
  const all = {
    'tsconfig.json': JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@modules/*': ['src/modules/*'] } },
    }),
    'architecture/table-owners.json': JSON.stringify({ users: 'auth' }),
    'src/db/schema.ts': 'export const users = {};',
    'src/modules/auth/repository.ts': 'export const secret = 1;',
    'src/modules/auth/public.ts': 'export const read = 1;',
    ...files,
  };
  for (const [file, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return { root, close: () => rmSync(root, { recursive: true, force: true }) };
}
test('boundary checker rejects static, aliased, require and dynamic private imports', () => {
  const f = fixture({
    'src/modules/billing/service.ts': `import {secret} from '../auth/repository'; import {secret as other} from '@modules/auth/repository'; require('../auth/repository'); import('../auth/repository'); import(getPath());`,
  });
  try {
    const v = collectViolations(f.root);
    assert(v.some((x) => x.detail === '@modules/auth/repository'));
    assert(v.some((x) => x.detail === '../auth/repository'));
    assert(v.some((x) => x.rule === 'dynamic-dependency'));
    const debt = v.slice(0, 1);
    assert(checkBoundaries(f.root, debt).length > 0);
  } finally {
    f.close();
  }
});
test('boundary checker rejects cycles, aliased foreign writes and domain infrastructure', () => {
  const f = fixture({
    'src/modules/auth/public.ts': `import {read} from '../billing/public'; export const identity=read;`,
    'src/modules/billing/public.ts': `import {identity} from '../auth/public'; export const read=identity;`,
    'src/modules/billing/service.ts': `import {users as accounts} from '../../db/schema'; db.update(accounts);`,
    'src/modules/billing/domain/rules.ts': `import {Pool} from 'pg'; import {sql} from 'drizzle-orm'; process.env.VALUE;`,
  });
  try {
    const v = collectViolations(f.root);
    assert(v.some((x) => x.rule === 'module-cycle'));
    assert(v.some((x) => x.rule === 'foreign-table-write'));
    assert(v.some((x) => x.rule === 'domain-dependency'));
    assert(v.some((x) => x.rule === 'module-environment'));
  } finally {
    f.close();
  }
});
test('type-only public ports do not create runtime module cycles', () => {
  const f = fixture({
    'src/modules/auth/public.ts': `import type {B} from '../billing/public'; export type A={b:B};`,
    'src/modules/billing/public.ts': `import {type A} from '../auth/public'; export type B={a:A};`,
  });
  try {
    assert.deepEqual(collectViolations(f.root), []);
  } finally {
    f.close();
  }
});
