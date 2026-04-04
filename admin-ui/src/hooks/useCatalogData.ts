import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { listCatalogSnapshot } from '@/api/apps';
import type { AuthorizationTemplateSummary, PriceAuthorizationSummary, PriceSummary, ProductSummary } from '@/api/types';

export interface ProductCatalogBundleSummary {
  product: ProductSummary;
  authorizationTemplates: AuthorizationTemplateSummary[];
  prices: PriceSummary[];
  priceAuthorizationCodesByPriceCode: Record<string, string[]>;
}

export function useCatalogData() {
  const { data: catalogData, isLoading } = useQuery({
    queryKey: ['catalog'],
    queryFn: listCatalogSnapshot
  });

  const products = catalogData?.products ?? [];
  const authorizationTemplates = catalogData?.authorizationTemplates ?? [];
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const templateMap = useMemo(() => new Map(authorizationTemplates.map((item) => [item.id, item])), [authorizationTemplates]);

  const allPrices = useMemo<PriceSummary[]>(
    () =>
      (catalogData?.prices ?? []).map((price) => {
        const product = productMap.get(price.productId) ?? null;
        const template = templateMap.get(price.authorizationTemplateId) ?? null;
        return {
          ...price,
          interval: price.interval ?? (price.billingType === 'one_time' ? 'one_time' : price.billingInterval),
          priceAmount: price.priceAmount ?? price.amount,
          productCode: price.productCode || product?.code,
          productName: price.productName || product?.name,
          authorizationTemplateCode: price.authorizationTemplateCode || template?.code,
          authorizationTemplateName: price.authorizationTemplateName || template?.name
        };
      }),
    [catalogData?.prices, productMap, templateMap]
  );

  const priceAuthorizations = useMemo<PriceAuthorizationSummary[]>(
    () => catalogData?.priceAuthorizations ?? [],
    [catalogData?.priceAuthorizations]
  );

  const priceAuthorizationCodesByPriceId = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const mapping of priceAuthorizations) {
      const authorizationTemplate = templateMap.get(mapping.authorizationTemplateId);
      if (!authorizationTemplate) continue;
      if (!grouped.has(mapping.priceId)) {
        grouped.set(mapping.priceId, []);
      }
      grouped.get(mapping.priceId)?.push(authorizationTemplate.code);
    }
    return grouped;
  }, [priceAuthorizations, templateMap]);

  const catalogBundles = useMemo<ProductCatalogBundleSummary[]>(() => {
    const authorizationTemplatesByProduct = new Map<string, AuthorizationTemplateSummary[]>();
    for (const authorizationTemplate of authorizationTemplates) {
      if (!authorizationTemplate.productId) continue;
      if (!authorizationTemplatesByProduct.has(authorizationTemplate.productId)) {
        authorizationTemplatesByProduct.set(authorizationTemplate.productId, []);
      }
      authorizationTemplatesByProduct.get(authorizationTemplate.productId)?.push(authorizationTemplate);
    }

    const pricesByProduct = new Map<string, PriceSummary[]>();
    for (const price of allPrices) {
      if (!price.productId) continue;
      if (!pricesByProduct.has(price.productId)) {
        pricesByProduct.set(price.productId, []);
      }
      pricesByProduct.get(price.productId)?.push(price);
    }

    return products.map((product) => {
      const productPrices = pricesByProduct.get(product.id) ?? [];
      return {
        product,
        authorizationTemplates: authorizationTemplatesByProduct.get(product.id) ?? [],
        prices: productPrices,
        priceAuthorizationCodesByPriceCode: Object.fromEntries(
          productPrices.map((price) => [price.code, priceAuthorizationCodesByPriceId.get(price.id) ?? []])
        )
      };
    });
  }, [allPrices, authorizationTemplates, priceAuthorizationCodesByPriceId, products]);

  return {
    products,
    authorizationTemplates,
    priceAuthorizations,
    allPrices,
    templateMap,
    priceAuthorizationCodesByPriceId,
    catalogBundles,
    isLoading
  };
}
