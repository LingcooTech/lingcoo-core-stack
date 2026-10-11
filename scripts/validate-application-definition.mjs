import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { repositoryPathSchema } from '@lingcoo/contracts';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  parseApplicationDocument,
  validateApplicationDefinition,
  definitionDigest,
} = require('../src/modules/app/definition.ts');

const filename = process.argv[2];
if (!filename)
  throw Error('Usage: npm run app:definition:validate -- <app.yaml|app.json> [repository-root]');
const root = realpathSync(resolve(process.argv[3] ?? dirname(filename)));
const raw = parseApplicationDocument(readFileSync(filename, 'utf8'));
if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
  const delivery = raw.delivery;
  if (delivery?.kind === 'compose' && typeof delivery.compose === 'string') {
    const path = repositoryPathSchema.parse(delivery.compose),
      file = realpathSync(resolve(root, path)),
      inside = relative(root, file);
    if (inside.startsWith('..') || isAbsolute(inside))
      throw Error('Compose file must remain within repository root');
    delivery.compose = parseApplicationDocument(readFileSync(file, 'utf8'));
  }
}
const definition = validateApplicationDefinition(raw);
console.info(
  JSON.stringify(
    {
      appCode: definition.app.code,
      delivery: definition.delivery.kind,
      images: definition.images.map((v) => v.key),
      definitionDigest: definitionDigest(definition),
    },
    null,
    2,
  ),
);
