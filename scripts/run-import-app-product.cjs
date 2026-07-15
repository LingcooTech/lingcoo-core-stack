const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

const commandArgs = existsSync('./dist/scripts/import-app-product.js')
  ? ['dist/scripts/import-app-product.js']
  : ['node_modules/tsx/dist/cli.mjs', 'src/scripts/import-app-product.ts'];

const result = spawnSync(process.execPath, [...commandArgs, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
