// Bundled into generated application repositories. Uses the platform's actual validator.
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { applicationReleaseInputSchema, repositoryPathSchema } from '@lingcoo/contracts';
import {
  parseApplicationDocument,
  validateApplicationDefinition,
  definitionDigest,
} from '../src/modules/app/definition.ts';

function readDefinition(filename, root) {
  const repository = realpathSync(root);
  const read = (file) => {
    const path = realpathSync(file),
      inside = relative(repository, path);
    if (inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside))
      throw Error('Application files must remain within repository root');
    return parseApplicationDocument(readFileSync(path, 'utf8'));
  };
  const raw = read(resolve(filename));
  if (raw?.delivery?.kind === 'compose' && typeof raw.delivery.compose === 'string')
    raw.delivery.compose = read(
      resolve(repository, repositoryPathSchema.parse(raw.delivery.compose)),
    );
  return validateApplicationDefinition(raw);
}

try {
  const [command, filename = 'stack/app.yaml', ...args] = process.argv.slice(2);
  if (!['validate', 'release'].includes(command))
    throw Error(
      'Usage: node stack-toolkit.cjs validate <app.yaml> [root] | release <app.yaml> <images.json> <version> <commit>',
    );
  const definition = readDefinition(
    filename,
    command === 'validate' ? args[0] || process.cwd() : process.cwd(),
  );
  if (command === 'release') {
    const [imagesFile, version, commit] = args;
    const release = applicationReleaseInputSchema.parse({
      definition,
      images: JSON.parse(readFileSync(imagesFile, 'utf8')),
      version,
      commit,
    });
    if (
      Object.keys(release.images).length !== definition.images.length ||
      definition.images.some(
        (image) =>
          typeof release.images[image.key] !== 'string' ||
          !release.images[image.key].startsWith(image.repository + '@sha256:'),
      )
    )
      throw Error('Release images must match every declared repository exactly');
  }
  console.info(
    JSON.stringify(
      {
        appCode: definition.app.code,
        schemaVersion: definition.schemaVersion,
        definitionDigest: definitionDigest(definition),
        delivery: definition.delivery.kind,
        images: definition.images,
        structuralValidation: 'passed',
        runtimeVerified: false,
      },
      null,
      2,
    ),
  );
} catch (error) {
  // Do not print documents or config values; field paths are enough for local correction.
  console.error(
    error?.issues
      ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.code}`).join('\n')
      : error.message,
  );
  process.exitCode = 1;
}
