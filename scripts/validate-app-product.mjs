import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateAppProduct } = require('../src/lib/app-product-validation.ts');

const args = process.argv.slice(2);
const file = args.find((argument) => !argument.startsWith('--'));
if (!file || args.some((argument) => argument.startsWith('--') && argument !== '--ready'))
  throw new Error('Usage: npm run app:validate -- <product.json> [--ready]');
const product = validateAppProduct(
  JSON.parse(await readFile(file, 'utf8')),
  args.includes('--ready'),
);
console.log(
  JSON.stringify(
    {
      valid: true,
      appCode: product.app.code,
      scope: args.includes('--ready') ? 'sale-configuration' : 'draft',
      note: 'Offline validation does not verify registry credentials, delivery URL availability or cloud deployment.',
    },
    null,
    2,
  ),
);
