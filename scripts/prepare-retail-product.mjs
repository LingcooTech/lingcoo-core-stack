import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { validateAppProduct } = require('../src/lib/app-product-validation.ts');

const [releaseDirectory, output, price, registryUser] = process.argv.slice(2);
if (
  !releaseDirectory ||
  !output ||
  !/^[1-9][0-9]*$/.test(price ?? '') ||
  !registryUser ||
  registryUser.startsWith('PENDING_')
)
  throw new Error(
    'Usage: node --import tsx scripts/prepare-retail-product.mjs <release-directory> <output.json> <price-fen> <scoped-registry-user>',
  );
const priceAmount = Number(price);
if (!Number.isSafeInteger(priceAmount) || priceAmount > 999999999) throw new Error('Invalid price');
const release = JSON.parse(await readFile(join(releaseDirectory, 'release.json'), 'utf8'));
if (
  release.appCode !== 'lingcoo_retail_oms' ||
  !/^[a-f0-9]{40}$/.test(release.sourceRevision ?? '') ||
  !/^[-a-zA-Z0-9./:_]+@sha256:[a-f0-9]{64}$/.test(release.image ?? '')
)
  throw new Error('Approved Retail release metadata is required');
const manifest = JSON.parse(
  await readFile(join(releaseDirectory, 'fd-delivery.manifest.json'), 'utf8'),
);
const bundle = await readFile(join(releaseDirectory, 'retail-delivery.tar.gz'));
const checksum = createHash('sha256').update(bundle).digest('hex');
const sums = await readFile(join(releaseDirectory, 'SHA256SUMS'), 'utf8');
const installer = await readFile(join(releaseDirectory, 'remote-install.sh'), 'utf8');
if (!sums.includes(checksum + '  retail-delivery.tar.gz') || !installer.includes(checksum))
  throw new Error('Delivery checksum/installer mismatch');
const product = validateAppProduct(
  JSON.parse(await readFile('app-products/lingcoo_retail_oms/product.json', 'utf8')),
);
product.app.status = 'active';
product.app.meta.onboardingStatus = 'ready_for_environment_acceptance';
product.app.meta.release = {
  sourceRevision: release.sourceRevision,
  image: release.image,
  bundleChecksum: checksum,
};
product.plans[0].status = 'active';
product.plans[0].priceAmount = priceAmount;
delete product.plans[0].meta.acceptanceOnlyPrice;
product.offers[0].status = 'active';
product.offers[0].priceAmount = priceAmount;
product.offers[0].code = 'self_hosted';
product.offers[0].title = 'Retail OMS 自部署';
product.offers[0].badge = '';
product.offers[0].description = '一个生产实例的镜像部署交付权益。';
product.delivery.manifest = manifest;
product.delivery.settings.values = { APP_IMAGE: release.image, ACR_USERNAME: registryUser };
product.delivery.settings.installer = {
  repoUrl: manifest.installer.repoUrl,
  repoBranch: manifest.installer.repoBranch,
};
validateAppProduct(product, true);
await writeFile(output, JSON.stringify(product, null, 2) + '\n');
console.log(
  'Release-specific product prepared. Verify hosted delivery URLs and registry access before production import.',
);
