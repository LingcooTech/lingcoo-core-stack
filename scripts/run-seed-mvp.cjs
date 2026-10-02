const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

const commandArgs = existsSync('./dist/scripts/seed-mvp.js')
  ? ['dist/scripts/seed-mvp.js']
  : ['node_modules/tsx/dist/cli.mjs', 'src/scripts/seed-mvp.ts'];

const result = spawnSync(process.execPath, commandArgs, {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
