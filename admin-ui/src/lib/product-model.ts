import type { AppWithDetails, FeatureSummary, PlanSummary, ProductSummary } from '@/api/types';

export type ManagedProductRecord = {
  product: ProductSummary;
  features: FeatureSummary[];
  plans: PlanSummary[];
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
  features: FeatureSummary[];
  plans: PlanSummary[];
  apps: AppWithDetails[];
}) {
  const featuresByProductId = new Map<string, FeatureSummary[]>();
  for (const feature of input.features) {
    if (!feature.productId) {
      continue;
    }

    if (!featuresByProductId.has(feature.productId)) {
      featuresByProductId.set(feature.productId, []);
    }

    featuresByProductId.get(feature.productId)?.push(feature);
  }

  const plansByProductId = new Map<string, PlanSummary[]>();
  for (const plan of input.plans) {
    if (!plan.productId) {
      continue;
    }

    if (!plansByProductId.has(plan.productId)) {
      plansByProductId.set(plan.productId, []);
    }

    plansByProductId.get(plan.productId)?.push(plan);
  }

  return input.products.map<ManagedProductRecord>((product) => {
    const linkedApps = getLinkedAppsForProduct(product.code, input.apps);

    return {
      product,
      features: featuresByProductId.get(product.id) ?? [],
      plans: plansByProductId.get(product.id) ?? [],
      linkedApps,
      primaryApp: getPrimaryAppForProduct(product.code, input.apps)
    };
  });
}
