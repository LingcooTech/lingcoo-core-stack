import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('admin-ui/dist');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1]);
assert(
  assets.some((asset) => asset.endsWith('.js')),
  'Admin HTML must reference a production JS asset',
);
for (const asset of assets) {
  assert(!/^https?:/.test(asset), 'Admin entry assets must be packaged in the image');
  const file = resolve(root, asset.replace(/^\//, ''));
  assert(file.startsWith(`${root}/`), 'Asset paths must stay within the production bundle');
  assert((await stat(file)).size > 0, `Missing or empty production asset: ${asset}`);
}
console.info(`Verified ${assets.length} Admin production entry assets`);

const developerIndex = JSON.parse(
  await readFile(resolve(root, 'developer-docs/index.json'), 'utf8'),
);
assert.equal(developerIndex.schemaVersion, 1);
assert.equal(developerIndex.items.filter((item) => typeof item.content === 'string').length, 4);
for (const item of developerIndex.items) {
  const published = await readFile(resolve(root, 'developer-docs', item.path), 'utf8');
  const source = await readFile(resolve(item.path), 'utf8');
  assert.equal(published, source, `Developer document differs from source: ${item.path}`);
  assert.equal(createHash('sha256').update(published).digest('hex'), item.sha256);
  if (item.content !== undefined) assert.equal(item.content, published);
}
console.info(
  `Verified ${developerIndex.items.length} developer documentation assets against source`,
);
