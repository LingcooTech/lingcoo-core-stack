import assert from 'node:assert/strict';
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
