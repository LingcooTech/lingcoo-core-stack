import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { generateDrizzleJson, generateMigration } = require('drizzle-kit/api');
const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
const latest = journal.entries.at(-1);
const baseline = JSON.parse(
  readFileSync(`drizzle/meta/${latest.tag.slice(0, 4)}_snapshot.json`, 'utf8'),
);
const current = generateDrizzleJson(require('../src/db/schema.ts'), baseline.prevId);
// IDs identify snapshot history; all schema and generator metadata must match.
const { id: baselineId, ...expected } = baseline;
const { id: currentId, ...actual } = current;
void baselineId;
void currentId;
assert.deepEqual(
  JSON.parse(JSON.stringify(actual)),
  expected,
  'Schema changed without a matching migration and latest snapshot. Run db:generate and review the SQL.',
);
assert.deepEqual(
  await generateMigration(baseline, current),
  [],
  'Unchanged schema must generate no migration',
);
console.info(`[schema] ${latest.tag}: snapshot and generation are synchronized`);
