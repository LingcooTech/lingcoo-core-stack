import { normalizeDeliveryManifest } from './delivery-manifest';
import { productSchema } from './app-product';
import { deliveryManifestSchema } from '@lingcoo/contracts';

export function validateAppProduct(input: unknown, readyForSale = false) {
  const product = productSchema.parse(input);
  const errors: string[] = [];
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length) errors.push(`Duplicate ${label}`);
  };
  unique(product.features?.map((entry) => entry.code) ?? [], 'feature code');
  unique(product.plans?.map((entry) => entry.code) ?? [], 'plan code');
  unique(product.offers?.map((entry) => entry.code) ?? [], 'offer code');
  for (const plan of product.plans ?? []) {
    unique(plan.featureCodes, `feature mapping in ${plan.code}`);
    for (const code of plan.featureCodes) {
      if (product.features && !product.features.some((feature) => feature.code === code))
        errors.push(`Plan ${plan.code} references unknown feature ${code}`);
    }
  }
  for (const offer of product.offers ?? []) {
    const plan = product.plans?.find((entry) => entry.code === offer.planCode);
    if (product.plans && !plan) errors.push(`Offer ${offer.code} references unknown plan`);
    if (plan && offer.currency.toUpperCase() !== plan.currency.toUpperCase())
      errors.push(`Offer ${offer.code} currency differs from plan`);
  }
  const raw = product.delivery?.manifest;
  if (raw && !deliveryManifestSchema.safeParse(raw).success)
    errors.push('Invalid manifest structure, version, field type or embedded secret');
  const manifest = normalizeDeliveryManifest(raw);
  if (product.app.meta?.deliveryMode === 'one_click' && !manifest)
    errors.push('One-click delivery requires a manifest');
  if (manifest && raw) {
    // Legacy normalization is intentionally tolerant; new product files must not silently lose fields.
    for (const key of ['envFields', 'secretFields', 'domainSlots', 'assets'] as const) {
      if (!Array.isArray(raw[key]) || raw[key].length !== manifest[key].length)
        errors.push(`Invalid manifest ${key}`);
    }
    unique(
      [...manifest.envFields, ...manifest.secretFields].map((field) => field.key),
      'configuration key',
    );
    unique(
      manifest.assets.map((asset) => asset.key),
      'asset key',
    );
    unique(
      manifest.domainSlots.map((slot) => slot.envKey),
      'domain environment key',
    );
    const fields = [...manifest.envFields, ...manifest.secretFields];
    for (const field of fields) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(field.key)) errors.push(`Invalid environment key ${field.key}`);
    }
    for (const asset of manifest.assets) {
      if (
        asset.type === 'docker_image' &&
        asset.imageEnv &&
        !manifest.envFields.some((field) => field.key === asset.imageEnv)
      )
        errors.push(`Asset ${asset.key} references unknown image field`);
      if (
        asset.authSecret &&
        !manifest.secretFields.some((field) => field.key === asset.authSecret)
      )
        errors.push(`Asset ${asset.key} references unknown secret`);
    }
    for (const key of Object.keys(product.delivery?.settings?.secretsFromEnv ?? {})) {
      if (!manifest.secretFields.some((field) => field.key === key && field.scope === 'preset'))
        errors.push(`Unknown platform secret ${key}`);
    }
    for (const key of Object.keys(product.delivery?.settings?.values ?? {})) {
      if (!manifest.envFields.some((field) => field.key === key && field.scope === 'preset'))
        errors.push(`Unknown platform preset ${key}`);
    }
  }
  if (readyForSale) {
    if (product.app.status !== 'active') errors.push('App is not active');
    if (!product.offers?.some((offer) => offer.status === 'active')) errors.push('No active offer');
    for (const offer of product.offers?.filter((entry) => entry.status === 'active') ?? []) {
      const plan = product.plans?.find((entry) => entry.code === offer.planCode);
      if (!plan || plan.status !== 'active') errors.push(`Offer ${offer.code} has no active plan`);
      if (plan?.meta?.acceptanceOnlyPrice)
        errors.push(`Plan ${plan.code} still uses acceptance pricing`);
    }
    for (const asset of manifest?.assets.filter(
      (entry) => entry.type === 'docker_image' && entry.required,
    ) ?? []) {
      const image =
        asset.image ||
        (asset.imageEnv ? product.delivery?.settings?.values?.[asset.imageEnv] : undefined);
      if (typeof image !== 'string' || !/^[-a-zA-Z0-9./:_]+@sha256:[a-f0-9]{64}$/.test(image))
        errors.push(`Asset ${asset.key} requires an approved digest`);
    }
    const installer = manifest?.installer;
    if (installer && !/^[a-f0-9]{64}$/.test(installer.remoteInstallScriptSha256 ?? ''))
      errors.push('Installer requires a trusted SHA-256 digest');
    if (
      installer &&
      (!installer.remoteInstallScriptUrl.startsWith('https://') ||
        /pending|\.invalid/.test(installer.remoteInstallScriptUrl))
    )
      errors.push('Installer publication is pending');
    for (const field of manifest?.secretFields.filter(
      (entry) => entry.scope === 'preset' && entry.required,
    ) ?? []) {
      if (!product.delivery?.settings?.secretsFromEnv?.[field.key])
        errors.push(`Missing platform secret mapping ${field.key}`);
    }
    for (const field of manifest?.envFields.filter(
      (entry) => entry.scope === 'preset' && entry.required,
    ) ?? []) {
      const value = product.delivery?.settings?.values?.[field.key] ?? field.defaultValue;
      if (value === undefined || value === '' || String(value).startsWith('PENDING_'))
        errors.push(`Missing platform preset ${field.key}`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return product;
}
