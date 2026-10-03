import { spawnSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const [kind, ...files] = process.argv.slice(2);
if (!['admin', 'backend', 'format'].includes(kind) || !files.length)
  throw new Error('Expected a file group and staged file paths');
const run = (cli, args, cwd = root) => {
  const result = spawnSync(process.execPath, [resolve(root, cli), ...args], {
    cwd,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
if (kind !== 'format') {
  const cwd = kind === 'admin' ? resolve(root, 'admin-ui') : root;
  run(
    'node_modules/eslint/bin/eslint.js',
    [
      '--fix',
      '--max-warnings',
      '0',
      '--no-warn-ignored',
      '--',
      ...files.map((file) => './' + relative(cwd, file)),
    ],
    cwd,
  );
}
run('node_modules/prettier/bin/prettier.cjs', ['--write', '--', ...files]);
