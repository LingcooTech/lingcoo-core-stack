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
test('modules cannot import runtime composition or legacy settings bridges', () => {
  const f = fixture({
    'src/composition/service-factories.ts': 'export interface ServiceFactories {}',
    'src/lib/site-settings.ts': 'export const read = () => {};',
    'src/modules/billing/service.ts':
      "import type { ServiceFactories } from '../../composition/service-factories'; import { read } from '../../lib/site-settings';",
  });
  try {
    const found = collectViolations(f.root);
    assert(found.some((v) => v.rule === 'module-composition-dependency'));
    assert(found.some((v) => v.rule === 'legacy-settings-import'));
  } finally {
    f.close();
  }
});
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

test('shared contracts and modules reject environment access and aliased runtime loaders', () => {
  const f = fixture({
    'src/db/schema.ts': `export const users={}; export const unregistered=pgTable('unregistered',{});`,
    'packages/contracts/src/index.ts': `import {read} from '../../../src/modules/auth/public'; export const value=process['env'].PRIVATE_VALUE;`,
    'src/modules/billing/service.ts': `import {loadEnv as arbitraryAlias} from '../../lib/env'; arbitraryAlias();`,
  });
  try {
    const found = collectViolations(f.root);
    assert(found.some((v) => v.rule === 'shared-backend-dependency'));
    assert(found.some((v) => v.rule === 'table-owner-missing' && v.detail === 'unregistered'));
    assert(
      found.some((v) => v.file.startsWith('packages/contracts') && v.rule === 'module-environment'),
    );
    assert(
      found.some(
        (v) =>
          v.file.endsWith('billing/service.ts') && v.detail.startsWith('environment-loader-import'),
      ),
    );
  } finally {
    f.close();
  }
});

test('local table aliases, raw execution and shared private bridges cannot bypass ownership', () => {
  const f = fixture({
    'src/modules/billing/service.ts': `import {users} from '../../db/schema'; import {secret} from '../../lib/bridge'; const target = users; const alias = (target); db.update(alias); db.execute(sql\`update users set role='admin'\`);`,
    'src/lib/bridge.ts': `export {secret} from '../auth/repository'; export {secret as hidden} from '../modules/auth/repository';`,
  });
  try {
    const found = collectViolations(f.root);
    assert(found.some((v) => v.rule === 'foreign-table-write' && v.detail === 'update:users:auth'));
    assert(found.some((v) => v.rule === 'raw-database-execution'));
    assert(found.some((v) => v.file === 'src/lib/bridge.ts' && v.rule === 'internal-import'));
  } finally {
    f.close();
  }
});

test('unresolved database write targets fail closed and split schema tables require ownership', () => {
  const f = fixture({
    'src/modules/billing/service.ts': `function write(target) { db.insert(target); }`,
    'src/db/schema/new.ts': `export const unknownTable = pgTable('unknown', {});`,
  });
  try {
    const found = collectViolations(f.root);
    assert(found.some((v) => v.rule === 'unresolved-table-write'));
    assert(found.some((v) => v.rule === 'table-owner-missing' && v.detail === 'unknownTable'));
  } finally {
    f.close();
  }
});

test('split table declarations must live in their registered owner file', () => {
  const f = fixture({ 'src/db/schema/billing.ts': "export const users=pgTable('users', {});" });
  try {
    assert(
      collectViolations(f.root).some(
        (v) => v.rule === 'table-owner-file' && v.detail === 'users:auth',
      ),
    );
  } finally {
    f.close();
  }
});
