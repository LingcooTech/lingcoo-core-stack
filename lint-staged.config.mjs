// lint-staged parses arguments without a shell; the runner uses spawnSync argv arrays.
const run = (kind) => (files) =>
  `node scripts/lint-staged-files.mjs ${kind} ${files.map((file) => JSON.stringify(file)).join(' ')}`;

export default {
  'src/**/*.{ts,js}': run('backend'),
  'admin-ui/src/**/*.{ts,tsx,js,jsx}': run('admin'),
  '*.{json,md,yml,yaml,css,html}': run('format'),
};
