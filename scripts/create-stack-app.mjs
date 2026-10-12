import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, writeFile, cp, rm, lstat, readdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    kind: { type: 'string' },
    directory: { type: 'string' },
    code: { type: 'string' },
    name: { type: 'string' },
    image: { type: 'string' },
    url: { type: 'string' },
  },
});
if (
  !['compose', 'none'].includes(values.kind) ||
  !values.directory ||
  !/^[a-z][a-z0-9_]{0,63}$/.test(values.code || '')
)
  throw Error(
    'Usage: npm run app:create -- --kind compose|none --directory <new-directory> --code <app_code> [--name <name>] [--image <registry/repository> | --url <HTTPS entry>]',
  );
if (values.name && (values.name.length > 120 || !values.name.trim()))
  throw Error('Invalid app name');
if (
  values.kind === 'compose' &&
  !/^[a-z0-9.-]+(?::[0-9]+)?\/[a-z0-9_./-]+$/.test(values.image || '')
)
  throw Error('Compose template requires --image registry/repository, without tag or credentials');
if (values.kind === 'none') {
  const url = new URL(values.url);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw Error('No-deployment entry must use HTTPS without credentials');
}
const target = resolve(values.directory);
if (
  await lstat(target).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  })
)
  throw Error(
    'Destination already exists; generate into a new directory and review files before integrating',
  );
await mkdir(dirname(target), { recursive: true });
const stage = await mkdtemp(join(dirname(target), '.stack-app-'));
try {
  await cp(join(repository, 'templates/stack-app', values.kind), stage, { recursive: true });
  await mkdir(join(stage, 'scripts'), { recursive: true });
  await mkdir(join(stage, 'stack'), { recursive: true });
  await mkdir(join(stage, '.github/workflows'), { recursive: true });
  const definition =
    values.kind === 'compose'
      ? JSON.parse(await readFile(join(repository, 'examples/stack-compose-app.json'), 'utf8'))
      : {
          schemaVersion: 1,
          app: {},
          features: [],
          images: [],
          delivery: {
            kind: 'none',
            url: values.url,
            instructions: '通过入口使用应用；收费前必须完成应用内授权接入及验收。',
          },
        };
  definition.app = {
    code: values.code,
    name: values.name || values.code,
    type: 'web_app',
    description: '请填写应用功能、适用对象和使用说明。',
    license: 'UNLICENSED',
    acquisition: 'free',
  };
  definition.features = [
    {
      code:
        values.code.length <= 60
          ? `${values.code}_use`
          : `${values.code.slice(0, 51)}_use_${createHash('sha256').update(values.code).digest('hex').slice(0, 8)}`,
      name: '使用应用',
      kind: 'boolean',
    },
  ];
  definition.build = { workflow: 'stack-release.yml' };
  if (values.kind === 'compose') {
    definition.images[0].repository = values.image;
    definition.delivery.compose = 'stack/compose.yaml';
    definition.delivery.entrypoint = { service: 'web', port: 8080, healthPath: '/health' };
  }
  // JSON is valid YAML; avoids extra runtime dependencies in the generated project.
  await writeFile(join(stage, 'stack/app.yaml'), JSON.stringify(definition, null, 2) + '\n');
  const output = await build({
    entryPoints: [join(repository, 'scripts/application-toolkit.mjs')],
    bundle: true,
    alias: { '@lingcoo/contracts': join(repository, 'packages/contracts/src/index.ts') },
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    write: false,
    legalComments: 'inline',
  });
  const validator = output.outputFiles[0].contents;
  await writeFile(join(stage, 'scripts/stack-toolkit.cjs'), validator);
  await cp(
    join(repository, 'scripts/publish-application-release.mjs'),
    join(stage, 'scripts/publish-application-release.mjs'),
  );
  await cp(join(repository, 'templates/stack-app/README.md'), join(stage, 'STACK-DELIVERY.md'));
  await writeFile(
    join(stage, 'stack/toolchain.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        validatorSha256: createHash('sha256').update(validator).digest('hex'),
        scope: 'structure-only; runtime acceptance is required before publishing',
      },
      null,
      2,
    ) + '\n',
  );
  let notices = 'Bundled validation tool third-party licenses\n\n';
  for (const dependency of ['yaml', 'zod'])
    notices += `${dependency}\n${await readFile(join(repository, 'node_modules', dependency, 'LICENSE'), 'utf8')}\n\n`;
  await writeFile(join(stage, 'scripts/THIRD_PARTY_NOTICES.txt'), notices);
  await writeFile(
    join(stage, '.gitignore'),
    'node_modules/\n.env\n.env.*\n!\.env.example\nimages.json\n',
  );
  await writeFile(
    join(stage, 'package.json'),
    JSON.stringify(
      {
        name: values.code.replaceAll('_', '-'),
        version: '0.1.0',
        private: true,
        type: 'module',
        engines: { node: '>=22' },
        scripts: {
          'stack:validate': 'node scripts/stack-toolkit.cjs validate stack/app.yaml',
          ...(values.kind === 'compose'
            ? {
                start: 'node server.mjs',
                test: 'node --test server.test.mjs',
                'test:image': 'node scripts/smoke-image.mjs',
              }
            : {}),
        },
      },
      null,
      2,
    ) + '\n',
  );
  // Claim a previously absent destination. Never merge into or overwrite an existing repository.
  await mkdir(target);
  try {
    for (const entry of await readdir(stage))
      await cp(join(stage, entry), join(target, entry), {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
  console.info(
    `Created ${values.kind} application template: ${target}\nRead STACK-DELIVERY.md, then run npm run stack:validate there.`,
  );
} finally {
  await rm(stage, { recursive: true, force: true });
}
