import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateAppProduct } from '../src/lib/app-product-validation';

const sample = () =>
  JSON.parse(readFileSync('app-products/lingcoo_retail_oms/product.json', 'utf8')) as Record<
    string,
    unknown
  >;
test('Retail draft is valid but cannot accidentally become a sale-ready product', () => {
  assert.equal(validateAppProduct(sample()).app.code, 'lingcoo_retail_oms');
  assert.throws(() => validateAppProduct(sample(), true), /not active/);
  const product = validateAppProduct(sample());
  product.app.status = 'active';
  product.plans![0]!.status = 'active';
  product.offers![0]!.status = 'active';
  assert.throws(() => validateAppProduct(product, true), /acceptance pricing/);
  delete product.plans![0]!.meta!.acceptanceOnlyPrice;
  assert.throws(() => validateAppProduct(product, true), /approved digest/);
});
test('invalid manifest fields and unknown asset secrets fail before database writes', () => {
  const product = validateAppProduct(sample());
  const manifest = product.delivery!.manifest!;
  manifest.envFields = [{ key: 'invalid-name', label: 'Invalid' }];
  assert.throws(() => validateAppProduct(product), /Invalid environment key|Invalid manifest/);
  const other = validateAppProduct(sample());
  const assets = other.delivery!.manifest!.assets as Array<Record<string, unknown>>;
  assets[0]!.authSecret = 'UNDECLARED';
  assert.throws(() => validateAppProduct(other), /unknown secret/);
});
test('duplicate product mappings and unresolved offers fail validation', () => {
  const product = validateAppProduct(sample());
  product.plans!.push(product.plans![0]!);
  assert.throws(() => validateAppProduct(product), /Duplicate plan/);
  const other = validateAppProduct(sample());
  other.offers![0]!.planCode = 'unregistered';
  assert.throws(() => validateAppProduct(other), /unknown plan/);
});
test('publishing rejects unsupported manifest versions and embedded secret defaults', () => {
  const product = validateAppProduct(sample());
  product.delivery!.manifest!.version = 'unsupported';
  assert.throws(() => validateAppProduct(product), /Invalid manifest structure/);
  const other = validateAppProduct(sample());
  const secrets = other.delivery!.manifest!.secretFields as Array<Record<string, unknown>>;
  secrets[0]!.defaultValue = 'must-not-be-published';
  assert.throws(() => validateAppProduct(other), /embedded secret/);
});

test('explicit free products validate without offers but still require one permanent zero-price mapped plan', () => {
  const product = {
    schemaVersion: 1,
    app: {
      code: 'free_sample',
      name: 'Free',
      status: 'active',
      meta: { acquisition: 'free', deliveryMode: 'none' },
    },
    features: [{ code: 'free_sample_access', name: 'Access' }],
    plans: [
      {
        code: 'free_sample_plan',
        name: 'Free',
        priceAmount: 0,
        interval: 'one_time',
        featureCodes: ['free_sample_access'],
      },
    ],
    offers: [],
  };
  assert.doesNotThrow(() => validateAppProduct(product, true));
  assert.throws(
    () =>
      validateAppProduct({ ...product, plans: [{ ...product.plans[0], interval: 'month' }] }, true),
    /Free acquisition/,
  );
  assert.throws(
    () =>
      validateAppProduct(
        { ...product, features: [{ ...product.features[0], status: 'inactive' }] },
        true,
      ),
    /Free acquisition/,
  );
  assert.throws(
    () =>
      validateAppProduct(
        { ...product, app: { ...product.app, meta: { acquisition: 'paid' } } },
        true,
      ),
    /No active offer/,
  );
});
