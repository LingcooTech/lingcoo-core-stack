import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listCatalogSnapshot } from '@/api/apps';
import type { FeatureSummary, PlanSummary } from '@/api/types';
import type { CatalogBundleSummary } from '@/components/apps/CatalogBundleDialog';

export function useCatalogData() {
  const { data: catalogData, isLoading } = useQuery({
    queryKey: ['catalog'],
    queryFn: listCatalogSnapshot
  });

  const products = catalogData?.products ?? [];
  const features = catalogData?.features ?? [];
  const planFeatures = catalogData?.planFeatures ?? [];
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const allPlans = useMemo(
    () =>
      (catalogData?.plans ?? []).map((plan) => {
        const product = plan.productId ? productMap.get(plan.productId) : null;
        return {
          ...plan,
          productCode: plan.productCode || product?.code,
          productName: plan.productName || product?.name
        };
      }),
    [catalogData?.plans, productMap]
  );
  const featureMap = useMemo(() => new Map(features.map((feature) => [feature.id, feature])), [features]);
  const planFeatureCodesByPlanId = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const mapping of planFeatures) {
      const feature = featureMap.get(mapping.featureId);
      if (!feature) continue;
      if (!grouped.has(mapping.planId)) {
        grouped.set(mapping.planId, []);
      }
      grouped.get(mapping.planId)?.push(feature.code);
    }
    return grouped;
  }, [featureMap, planFeatures]);
  const catalogBundles = useMemo<CatalogBundleSummary[]>(() => {
    const featuresByProduct = new Map<string, FeatureSummary[]>();
    for (const feature of features) {
      if (!feature.productId) continue;
      if (!featuresByProduct.has(feature.productId)) {
        featuresByProduct.set(feature.productId, []);
      }
      featuresByProduct.get(feature.productId)?.push(feature);
    }

    const plansByProduct = new Map<string, PlanSummary[]>();
    for (const plan of allPlans) {
      if (!plan.productId) continue;
      if (!plansByProduct.has(plan.productId)) {
        plansByProduct.set(plan.productId, []);
      }
      plansByProduct.get(plan.productId)?.push(plan);
    }

    return products.map((product) => {
      const productPlans = plansByProduct.get(product.id) ?? [];
      return {
        product,
        features: featuresByProduct.get(product.id) ?? [],
        plans: productPlans,
        planFeatureCodesByPlanCode: Object.fromEntries(
          productPlans.map((plan) => [plan.code, planFeatureCodesByPlanId.get(plan.id) ?? []])
        )
      };
    });
  }, [allPlans, features, planFeatureCodesByPlanId, products]);

  return { products, features, allPlans, featureMap, planFeatureCodesByPlanId, catalogBundles, isLoading };
}
