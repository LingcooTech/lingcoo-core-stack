import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const tsc = resolve('../../node_modules/typescript/bin/tsc');
for (const [module, outDir] of [
  ['CommonJS', 'dist/cjs'],
  ['ES2022', 'dist/esm'],
]) {
  const result = spawnSync(
    process.execPath,
    [tsc, '-p', 'tsconfig.json', '--module', module, '--outDir', outDir],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    `${outDir}/package.json`,
    JSON.stringify({ type: module === 'CommonJS' ? 'commonjs' : 'module' }),
  );
}
