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

  const features = catalogData?.features ?? [];
  const planFeatures = catalogData?.planFeatures ?? [];
  const allPlans = useMemo(
    () => (catalogData?.plans ?? []).map((plan) => ({ ...plan })),
    [catalogData?.plans]
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
    const featuresByApp = new Map<string, FeatureSummary[]>();
    for (const feature of features) {
      if (!feature.appId) continue;
      if (!featuresByApp.has(feature.appId)) {
        featuresByApp.set(feature.appId, []);
      }
      featuresByApp.get(feature.appId)?.push(feature);
    }

    const plansByApp = new Map<string, PlanSummary[]>();
    for (const plan of allPlans) {
      if (!plan.appId) continue;
      if (!plansByApp.has(plan.appId)) {
        plansByApp.set(plan.appId, []);
      }
      plansByApp.get(plan.appId)?.push(plan);
    }

    // Collect unique appIds from plans and features
    const appIds = new Set<string>();
    for (const plan of allPlans) {
      if (plan.appId) appIds.add(plan.appId);
    }
    for (const feature of features) {
      if (feature.appId) appIds.add(feature.appId);
    }

    return [...appIds].map((appId) => {
      const appPlans = plansByApp.get(appId) ?? [];
      return {
        product: { id: appId, code: appId, name: appId },
        features: featuresByApp.get(appId) ?? [],
        plans: appPlans,
        planFeatureCodesByPlanCode: Object.fromEntries(
          appPlans.map((plan) => [plan.code, planFeatureCodesByPlanId.get(plan.id) ?? []])
        )
      };
    });
  }, [allPlans, features, planFeatureCodesByPlanId]);

  // For backward compat: products is now empty since CatalogSnapshot no longer has products
  const products: { id: string; code: string; name: string }[] = [];

  return { products, features, allPlans, featureMap, planFeatureCodesByPlanId, catalogBundles, isLoading };
}
