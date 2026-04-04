import type { AppWithDetails, AuthorizationTemplateSummary, PriceSummary, ProductSummary } from '@/api/types';

export type ManagedProductRecord = {
  product: ProductSummary;
  authorizationTemplates: AuthorizationTemplateSummary[];
  prices: PriceSummary[];
  linkedApps: AppWithDetails[];
  primaryApp: AppWithDetails | null;
};

function byUpdatedAtDesc(left: AppWithDetails, right: AppWithDetails) {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

export function getLinkedAppsForProduct(productCode: string, apps: AppWithDetails[]) {
  return apps.filter((app) => (app.products ?? []).some((product) => product.code === productCode));
}

export function getPrimaryAppForProduct(productCode: string, apps: AppWithDetails[]) {
  const linkedApps = getLinkedAppsForProduct(productCode, apps).sort((left, right) => {
    const leftExact = left.code === productCode ? 1 : 0;
    const rightExact = right.code === productCode ? 1 : 0;

    if (leftExact !== rightExact) {
      return rightExact - leftExact;
    }

    const leftSingle = (left.products?.length ?? 0) === 1 ? 1 : 0;
    const rightSingle = (right.products?.length ?? 0) === 1 ? 1 : 0;
    if (leftSingle !== rightSingle) {
      return rightSingle - leftSingle;
    }

    return byUpdatedAtDesc(left, right);
  });

  return linkedApps[0] ?? null;
}

export function productNeedsDedicatedProfile(productCode: string, app: AppWithDetails | null) {
  return Boolean(app && (app.products?.length ?? 0) > 1 && app.code !== productCode);
}

export function buildManagedProducts(input: {
  products: ProductSummary[];
  authorizationTemplates: AuthorizationTemplateSummary[];
  prices: PriceSummary[];
  apps: AppWithDetails[];
}) {
  const authorizationTemplatesByProductId = new Map<string, AuthorizationTemplateSummary[]>();
  for (const authorizationTemplate of input.authorizationTemplates) {
    if (!authorizationTemplate.productId) {
      continue;
    }

    if (!authorizationTemplatesByProductId.has(authorizationTemplate.productId)) {
      authorizationTemplatesByProductId.set(authorizationTemplate.productId, []);
    }

    authorizationTemplatesByProductId.get(authorizationTemplate.productId)?.push(authorizationTemplate);
  }

  const pricesByProductId = new Map<string, PriceSummary[]>();
  for (const price of input.prices) {
    if (!price.productId) {
      continue;
    }

    if (!pricesByProductId.has(price.productId)) {
      pricesByProductId.set(price.productId, []);
    }

    pricesByProductId.get(price.productId)?.push(price);
  }

  return input.products.map<ManagedProductRecord>((product) => {
    const linkedApps = getLinkedAppsForProduct(product.code, input.apps);

    return {
      product,
      authorizationTemplates: authorizationTemplatesByProductId.get(product.id) ?? [],
      prices: pricesByProductId.get(product.id) ?? [],
      linkedApps,
      primaryApp: getPrimaryAppForProduct(product.code, input.apps)
    };
  });
}
