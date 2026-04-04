import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  Rocket,
  Save,
  Trash2
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import type { AppHighlight, DeliveryFieldDefinition, DeliveryFieldGroup, PlanSummary } from '@/api/types';
import { listAppsAdmin, syncAppDeliveryManifest, upsertApp, upsertCatalogBundle } from '@/api/apps';
import { clearDeliverySettings, getDeliverySettings, upsertDeliverySettings } from '@/api/delivery';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useCatalogData } from '@/hooks/useCatalogData';
import {
  formatPlanInterval,
  formatPriceYuan,
  offersFromApp,
  slugify,
  type EditableOffer
} from '@/lib/catalog-utils';
import { getLinkedAppsForProduct, getPrimaryAppForProduct, productNeedsDedicatedProfile } from '@/lib/product-model';
import { getInitials } from '@/lib/utils';

type DeliveryManifestSourceState = {
  repoUrl: string;
  repoBranch: string;
  manifestPath: string;
  manifestUrl: string;
};

type DraftValues = Record<string, string | boolean | null>;
type DraftSecrets = Record<string, string>;

type WorkspaceForm = {
  code: string;
  name: string;
  iconUrl: string;
  shortDescription: string;
  developer: string;
  version: string;
  updateDate: string;
  category: string;
  type: 'chrome_extension' | 'web_app' | 'service';
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
  deliveryMode: 'direct_access' | 'one_click_deploy';
  coverUrl: string;
  content: string;
};

type EditableProductFeature = {
  id: string;
  icon: string;
  title: string;
  description: string;
};

type EditableCapabilityFeature = {
  id: string;
  code: string;
  name: string;
  kind: string;
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
};

type EditableBasePlan = {
  id: string;
  code: string;
  name: string;
  priceYuan: string;
  currency: string;
  interval: 'month' | 'year' | 'one_time';
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
  featureIds: string[];
};

const capabilityKindOptions = [
  { value: 'boolean', label: '开关能力' },
  { value: 'quota', label: '额度能力' },
  { value: 'access', label: '访问能力' }
] as const;

const authorizationIntervalOptions = [
  { value: 'one_time', label: '一次性授权' },
  { value: 'month', label: '月度授权' },
  { value: 'year', label: '年度授权' }
] as const;

function createDraftId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readMetaText(meta: Record<string, unknown> | undefined, key: string) {
  const value = meta?.[key];
  return typeof value === 'string' ? value : '';
}

function createDefaultForm(product: { name: string; type?: string; status?: string }) {
  return {
    code: '',
    name: product.name,
    iconUrl: '',
    shortDescription: '',
    developer: '',
    version: '',
    updateDate: '',
    category: '',
    type: ((product.type as WorkspaceForm['type']) || 'service'),
    status: ((product.status as WorkspaceForm['status']) || 'active'),
    deliveryMode: product.type === 'chrome_extension' ? 'direct_access' : 'one_click_deploy',
    coverUrl: '',
    content: ''
  } satisfies WorkspaceForm;
}

function buildMarketingFeatureDrafts(features: AppHighlight[] | undefined) {
  return (features ?? []).map((feature) => ({
    id: createDraftId('marketing_feature'),
    icon: feature.icon ?? '',
    title: feature.title,
    description: feature.description
  }));
}

function buildCapabilityFeatureDrafts(
  features: Array<{ code: string; name: string; kind: string; status?: string }>
) {
  return features.map((feature) => ({
    id: createDraftId('capability_feature'),
    code: feature.code,
    name: feature.name,
    kind: feature.kind,
    status: (feature.status as EditableCapabilityFeature['status']) || 'active'
  }));
}

function buildBasePlanDrafts(
  plans: PlanSummary[],
  planFeatureCodesByPlanCode: Record<string, string[]>,
  capabilityFeatures: EditableCapabilityFeature[]
): EditableBasePlan[] {
  const featureIdByCode = new Map(capabilityFeatures.map((feature) => [feature.code, feature.id]));

  return plans.map((plan) => ({
    id: createDraftId('base_plan'),
    code: plan.code,
    name: plan.name,
    priceYuan: formatPriceYuan(plan.priceAmount),
    currency: plan.currency || 'CNY',
    interval: (plan.interval as EditableBasePlan['interval']) || 'one_time',
    status: (plan.status as EditableBasePlan['status']) || 'active',
    featureIds: (planFeatureCodesByPlanCode[plan.code] ?? [])
      .map((code) => featureIdByCode.get(code))
      .filter((value): value is string => Boolean(value))
  }));
}

function normalizeMarketingFeatures(features: EditableProductFeature[]): AppHighlight[] {
  return features
    .map((feature) => ({
      icon: feature.icon.trim() || undefined,
      title: feature.title.trim(),
      description: feature.description.trim()
    }))
    .filter((feature) => feature.title && feature.description);
}

function sortFieldsByLabel(fields: DeliveryFieldDefinition[]) {
  return [...fields].sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
}

function getDeliveryScopeLabel(scope: DeliveryFieldDefinition['scope'], advanced?: boolean) {
  if (scope === 'user_input') {
    return '终端用户部署时填写';
  }

  return advanced ? '平台管理员高级预设' : '平台管理员预设';
}

export function ProductWorkspacePage() {
  const { productCode: routeProductCode } = useParams<{ productCode?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [initializedProfileCode, setInitializedProfileCode] = useState<string | null>(null);
  const [form, setForm] = useState<WorkspaceForm | null>(null);
  const [marketingFeatures, setMarketingFeatures] = useState<EditableProductFeature[]>([]);
  const [capabilityFeatures, setCapabilityFeatures] = useState<EditableCapabilityFeature[]>([]);
  const [basePlans, setBasePlans] = useState<EditableBasePlan[]>([]);
  const [editableOffers, setEditableOffers] = useState<EditableOffer[]>([]);
  const [deliverySource, setDeliverySource] = useState<DeliveryManifestSourceState>({
    repoUrl: '',
    repoBranch: 'main',
    manifestPath: 'fd-delivery.manifest.json',
    manifestUrl: ''
  });
  const [draftValues, setDraftValues] = useState<DraftValues>({});
  const [draftSecrets, setDraftSecrets] = useState<DraftSecrets>({});

  const { catalogBundles, products, isLoading: isCatalogLoading } = useCatalogData();
  const appsQuery = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const apps = appsQuery.data?.items ?? [];
  const isCreateMode = !routeProductCode;
  const effectiveProductCode = (routeProductCode || form?.code || '').trim();

  const bundle = useMemo(
    () => catalogBundles.find((item) => item.product.code === effectiveProductCode) ?? null,
    [catalogBundles, effectiveProductCode]
  );
  const product = bundle?.product ?? products.find((item) => item.code === effectiveProductCode) ?? null;
  const linkedApps = useMemo(() => (product ? getLinkedAppsForProduct(product.code, apps) : []), [apps, product]);
  const primaryApp = useMemo(() => (product ? getPrimaryAppForProduct(product.code, apps) : null), [apps, product]);
  const needsDedicatedProfile = productNeedsDedicatedProfile(effectiveProductCode, primaryApp);
  const targetProfileCode = isCreateMode
    ? effectiveProductCode
    : needsDedicatedProfile
      ? (product?.code ?? '')
      : (primaryApp?.code ?? product?.code ?? '');
  const hasDeliveryManifest = Boolean(primaryApp?.meta?.deliveryManifest);
  const deliverySettingsQuery = useQuery({
    queryKey: ['delivery-settings', targetProfileCode],
    queryFn: () => getDeliverySettings(targetProfileCode),
    enabled: Boolean(primaryApp && !needsDedicatedProfile)
  });
  const deliverySettings = deliverySettingsQuery.data;
  const deliveryGroups = deliverySettings?.manifest.groups ?? [];
  const visibleEnvFields = useMemo(() => {
    if (!deliverySettings) {
      return [];
    }

    return sortFieldsByLabel(deliverySettings.manifest.envFields.filter((field) => field.scope !== 'system'));
  }, [deliverySettings]);
  const visibleSecretFields = useMemo(() => {
    if (!deliverySettings) {
      return [];
    }

    return sortFieldsByLabel(deliverySettings.manifest.secretFields.filter((field) => field.scope !== 'system'));
  }, [deliverySettings]);
  const deliveryGroupMap = useMemo(() => {
    const map = new Map<string, { group: DeliveryFieldGroup; env: DeliveryFieldDefinition[]; secret: DeliveryFieldDefinition[] }>();

    const ensureGroup = (key: string) => {
      if (!map.has(key)) {
        const fallback = deliveryGroups.find((group) => group.key === key) ?? { key, label: key };
        map.set(key, { group: fallback, env: [], secret: [] });
      }

      return map.get(key)!;
    };

    for (const field of visibleEnvFields) {
      ensureGroup(field.group ?? 'general').env.push(field);
    }

    for (const field of visibleSecretFields) {
      ensureGroup(field.group ?? 'general').secret.push(field);
    }

    return Array.from(map.values());
  }, [deliveryGroups, visibleEnvFields, visibleSecretFields]);

  useEffect(() => {
    if (!targetProfileCode || initializedProfileCode === targetProfileCode) {
      return;
    }

    const meta =
      primaryApp?.meta && typeof primaryApp.meta === 'object' && !Array.isArray(primaryApp.meta)
        ? (primaryApp.meta as Record<string, unknown>)
        : {};
    const deliveryManifestSource =
      meta.deliveryManifestSource && typeof meta.deliveryManifestSource === 'object' && !Array.isArray(meta.deliveryManifestSource)
        ? (meta.deliveryManifestSource as Record<string, unknown>)
        : {};

    if (primaryApp) {
      const capabilityDrafts = buildCapabilityFeatureDrafts(bundle?.features ?? []);

      setForm({
        code: primaryApp.code,
        name: primaryApp.name,
        iconUrl: primaryApp.iconUrl ?? '',
        shortDescription: primaryApp.tagline ?? primaryApp.description ?? '',
        developer: readMetaText(meta, 'productDeveloper'),
        version: readMetaText(meta, 'productVersion'),
        updateDate: readMetaText(meta, 'productUpdateDate'),
        category: primaryApp.category ?? '',
        type: primaryApp.type as WorkspaceForm['type'],
        status: primaryApp.status as WorkspaceForm['status'],
        deliveryMode:
          meta.productDeliveryMode === 'direct_access' || meta.productDeliveryMode === 'one_click_deploy'
            ? meta.productDeliveryMode
            : primaryApp.type === 'chrome_extension'
              ? 'direct_access'
              : 'one_click_deploy',
        coverUrl: primaryApp.coverUrl ?? '',
        content: primaryApp.content ?? ''
      });
      setMarketingFeatures(buildMarketingFeatureDrafts(primaryApp.highlights));
      setCapabilityFeatures(capabilityDrafts);
      setBasePlans(buildBasePlanDrafts((bundle?.plans ?? []) as Array<PlanSummary & { billingProvider?: string }>, bundle?.planFeatureCodesByPlanCode ?? {}, capabilityDrafts));
      setEditableOffers(offersFromApp(primaryApp));
      setDeliverySource({
        repoUrl: typeof deliveryManifestSource.repoUrl === 'string' ? deliveryManifestSource.repoUrl : '',
        repoBranch: typeof deliveryManifestSource.repoBranch === 'string' ? deliveryManifestSource.repoBranch : 'main',
        manifestPath:
          typeof deliveryManifestSource.manifestPath === 'string'
            ? deliveryManifestSource.manifestPath
            : 'fd-delivery.manifest.json',
        manifestUrl: typeof deliveryManifestSource.manifestUrl === 'string' ? deliveryManifestSource.manifestUrl : ''
      });
    } else {
      setForm({
        ...createDefaultForm(product ?? { name: '', type: 'service', status: 'active' }),
        code: effectiveProductCode
      });
      setMarketingFeatures([]);
      setCapabilityFeatures(buildCapabilityFeatureDrafts(bundle?.features ?? []));
      setBasePlans(buildBasePlanDrafts((bundle?.plans ?? []) as Array<PlanSummary & { billingProvider?: string }>, bundle?.planFeatureCodesByPlanCode ?? {}, buildCapabilityFeatureDrafts(bundle?.features ?? [])));
      setEditableOffers([]);
      setDeliverySource({
        repoUrl: '',
        repoBranch: 'main',
        manifestPath: 'fd-delivery.manifest.json',
        manifestUrl: ''
      });
    }

    setInitializedProfileCode(targetProfileCode);
  }, [bundle, effectiveProductCode, initializedProfileCode, primaryApp, product, targetProfileCode]);

  useEffect(() => {
    if (!deliverySettings) {
      return;
    }

    setDraftValues(deliverySettings.values);
    setDraftSecrets(Object.fromEntries(deliverySettings.manifest.secretFields.map((field) => [field.key, ''])));
  }, [deliverySettings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form || !targetProfileCode) {
        throw new Error('产品上下文缺失');
      }

      const normalizedProductCode = slugify(form.code);
      if (!normalizedProductCode) {
        throw new Error('产品 Code 不能为空');
      }
      if (!form.name.trim()) {
        throw new Error('产品名称不能为空');
      }

      const normalizedCapabilityFeatures: Array<{
        code: string;
        name: string;
        kind: string;
        status: EditableCapabilityFeature['status'];
      }> = [];
      const capabilityCodeById = new Map<string, string>();

      for (const feature of capabilityFeatures) {
        const code = slugify(feature.code || feature.name);
        const name = feature.name.trim();
        if (!code || !name) {
          continue;
        }

        normalizedCapabilityFeatures.push({
          code,
          name,
          kind: feature.kind,
          status: feature.status
        });
        capabilityCodeById.set(feature.id, code);
      }

      if (normalizedCapabilityFeatures.length === 0) {
        throw new Error('至少需要一个授权能力项');
      }

      const normalizedBasePlans: Array<{
        code: string;
        name: string;
        priceAmount: number;
        currency: string;
        interval: EditableBasePlan['interval'];
        status: EditableBasePlan['status'];
        featureCodes: string[];
      }> = [];

      for (const plan of basePlans) {
        const code = slugify(plan.code || plan.name);
        const name = plan.name.trim();
        const featureCodes = [...new Set(plan.featureIds.map((id) => capabilityCodeById.get(id)).filter((value): value is string => Boolean(value)))];

        if (!code || !name || featureCodes.length === 0) {
          continue;
        }

        normalizedBasePlans.push({
          code,
          name,
          priceAmount: Math.round(Number(plan.priceYuan || '0') * 100),
          currency: plan.currency.trim().toUpperCase() || 'CNY',
          interval: plan.interval,
          status: plan.status,
          featureCodes
        });
      }

      if (normalizedBasePlans.length === 0) {
        throw new Error('至少需要一个有效的基础 Plan，并且每个 Plan 至少绑定一个授权能力');
      }

      await upsertCatalogBundle(normalizedProductCode, {
        name: form.name,
        type: form.type,
        status: form.status,
        features: normalizedCapabilityFeatures,
        plans: normalizedBasePlans.map((plan) => ({
          ...plan,
          billingProvider: 'self_hosted' as const
        }))
      });

      const checkoutOffers = editableOffers
        .map((offer, index) => ({
          code: slugify(offer.code),
          planCode: offer.planCode,
          title: offer.title.trim(),
          description: offer.description.trim(),
          badge: offer.badge.trim(),
          priceAmount: Math.round(Number(offer.priceYuan || '0') * 100),
          currency: offer.currency.trim().toUpperCase() || 'CNY',
          status: offer.status,
          isDefault: offer.isDefault,
          sortOrder: index
        }))
        .filter((offer) => offer.code && offer.planCode && offer.title);

      const checkoutDefaultOfferCode =
        checkoutOffers.find((offer) => offer.isDefault)?.code ||
        checkoutOffers[0]?.code ||
        undefined;

      const meta = { ...((needsDedicatedProfile ? {} : primaryApp?.meta) ?? {}) } as Record<string, unknown>;
      delete meta.checkoutPlanCode;
      delete meta.checkoutOffers;
      delete meta.checkoutDefaultOfferCode;

      if (form.developer.trim()) {
        meta.productDeveloper = form.developer.trim();
      } else {
        delete meta.productDeveloper;
      }

      if (form.version.trim()) {
        meta.productVersion = form.version.trim();
      } else {
        delete meta.productVersion;
      }

      if (form.updateDate.trim()) {
        meta.productUpdateDate = form.updateDate.trim();
      } else {
        delete meta.productUpdateDate;
      }
      meta.productDeliveryMode = form.deliveryMode;
      delete meta.productRequiresAccessKey;

      meta.deliveryManifestSource = {
        repoUrl: deliverySource.repoUrl || undefined,
        repoBranch: deliverySource.repoBranch || undefined,
        manifestPath: deliverySource.manifestPath || undefined,
        manifestUrl: deliverySource.manifestUrl || undefined
      };

      return upsertApp(targetProfileCode, {
        name: form.name,
        tagline: form.shortDescription || undefined,
        description: form.shortDescription || undefined,
        content: form.content || undefined,
        iconUrl: form.iconUrl || undefined,
        coverUrl: form.coverUrl || undefined,
        highlights: normalizeMarketingFeatures(marketingFeatures),
        screenshots: primaryApp?.screenshots ?? [],
        faq: primaryApp?.faq ?? [],
        links: primaryApp?.links ?? [],
        category: form.category || undefined,
        type: form.type,
        status: form.status,
        productCodes: [normalizedProductCode],
        checkoutOffers,
        checkoutDefaultOfferCode,
        meta
      });
    },
    onSuccess: async () => {
      toast.success('产品详情、授权方案和交付配置已保存');
      await qc.invalidateQueries({ queryKey: ['catalog'] });
      await qc.invalidateQueries({ queryKey: ['apps'] });
      setInitializedProfileCode(null);
      if (isCreateMode) {
        navigate(`/admin/products/${slugify(form?.code ?? '')}`, { replace: true });
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败')
  });

  const syncManifestMutation = useMutation({
    mutationFn: async () => {
      if (!targetProfileCode) {
        throw new Error('产品档案尚未初始化');
      }

      return syncAppDeliveryManifest(targetProfileCode, {
        repoUrl: deliverySource.repoUrl || undefined,
        repoBranch: deliverySource.repoBranch || undefined,
        manifestPath: deliverySource.manifestPath || undefined,
        manifestUrl: deliverySource.manifestUrl || undefined
      });
    },
    onSuccess: async () => {
      toast.success('交付声明已同步');
      await qc.invalidateQueries({ queryKey: ['apps'] });
      setInitializedProfileCode(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '同步失败')
  });

  const saveDeliveryMutation = useMutation({
    mutationFn: async () => {
      if (!primaryApp || needsDedicatedProfile) {
        throw new Error('请先保存产品详情，生成专属产品档案后再维护交付配置');
      }

      return upsertDeliverySettings(primaryApp.code, {
        values: draftValues,
        secrets: Object.fromEntries(Object.entries(draftSecrets).filter(([, value]) => value.trim().length > 0))
      });
    },
    onSuccess: () => {
      toast.success('交付配置已保存');
      void qc.invalidateQueries({ queryKey: ['delivery-settings', targetProfileCode] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败')
  });

  const clearDeliveryMutation = useMutation({
    mutationFn: async () => {
      if (!primaryApp || needsDedicatedProfile) {
        throw new Error('请先保存产品详情，生成专属产品档案后再维护交付配置');
      }

      return clearDeliverySettings(primaryApp.code);
    },
    onSuccess: () => {
      toast.success('交付覆盖值已清空');
      void qc.invalidateQueries({ queryKey: ['delivery-settings', targetProfileCode] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '清空失败')
  });

  if (isCatalogLoading || appsQuery.isLoading || !form) {
    return <div className="p-6 text-sm text-muted-foreground">加载产品详情中...</div>;
  }

  if (!isCreateMode && (!product || !bundle)) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-border bg-white p-6 text-sm text-muted-foreground">
          未找到产品 {routeProductCode}
        </div>
      </div>
    );
  }

  const addMarketingFeature = () => {
    setMarketingFeatures((current) => [
      ...current,
      {
        id: createDraftId('marketing_feature'),
        icon: '',
        title: '',
        description: ''
      }
    ]);
  };

  const updateMarketingFeature = (
    featureId: string,
    updater: (current: EditableProductFeature) => EditableProductFeature
  ) => {
    setMarketingFeatures((current) => current.map((feature) => (feature.id === featureId ? updater(feature) : feature)));
  };

  const removeMarketingFeature = (featureId: string) => {
    setMarketingFeatures((current) => current.filter((feature) => feature.id !== featureId));
  };

  const addCapabilityFeature = () => {
    setCapabilityFeatures((current) => [
      ...current,
      {
        id: createDraftId('capability_feature'),
        code: '',
        name: '',
        kind: 'boolean',
        status: 'active'
      }
    ]);
  };

  const updateCapabilityFeature = (
    featureId: string,
    updater: (current: EditableCapabilityFeature) => EditableCapabilityFeature
  ) => {
    setCapabilityFeatures((current) => current.map((feature) => (feature.id === featureId ? updater(feature) : feature)));
  };

  const removeCapabilityFeature = (featureId: string) => {
    setCapabilityFeatures((current) => current.filter((feature) => feature.id !== featureId));
    setBasePlans((current) =>
      current.map((plan) => ({
        ...plan,
        featureIds: plan.featureIds.filter((item) => item !== featureId)
      }))
    );
  };

  const addBasePlan = () => {
    setBasePlans((current) => [
      ...current,
      {
        id: createDraftId('base_plan'),
        code: '',
        name: '',
        priceYuan: '0.00',
        currency: 'CNY',
        interval: 'one_time',
        status: 'inactive',
        featureIds: capabilityFeatures[0] ? [capabilityFeatures[0].id] : []
      }
    ]);
  };

  const updateBasePlan = (planId: string, updater: (current: EditableBasePlan) => EditableBasePlan) => {
    setBasePlans((current) => {
      const target = current.find((plan) => plan.id === planId);
      const next = current.map((plan) => (plan.id === planId ? updater(plan) : plan));
      const nextTarget = next.find((plan) => plan.id === planId);

      if (!target || !nextTarget) {
        return next;
      }

      const previousCode = slugify(target.code || target.name);
      const nextCode = slugify(nextTarget.code || nextTarget.name);

      if (previousCode && previousCode !== nextCode) {
        setEditableOffers((offers) =>
          offers.map((offer) => ({
            ...offer,
            planCode: offer.planCode === previousCode ? nextCode : offer.planCode
          }))
        );
      }

      return next;
    });
  };

  const removeBasePlan = (planId: string) => {
    const plan = basePlans.find((item) => item.id === planId);
    const planCode = plan ? slugify(plan.code || plan.name) : '';
    setBasePlans((current) => current.filter((item) => item.id !== planId));
    if (planCode) {
      setEditableOffers((offers) => offers.filter((offer) => offer.planCode !== planCode));
    }
  };

  const addOffer = () => {
    const seedPlan = basePlans[0];
    setEditableOffers((current) => {
      const next = [
        ...current,
        {
          id: createDraftId('offer'),
          code: slugify(seedPlan?.code || `offer_${Date.now().toString(36)}`),
          planCode: slugify(seedPlan?.code || seedPlan?.name || ''),
          title: seedPlan?.name || '',
          description: '',
          badge: '',
          priceYuan: seedPlan?.priceYuan || '0.00',
          currency: seedPlan?.currency || 'CNY',
          status: seedPlan?.status || 'active',
          isDefault: false
        }
      ];
      if (next.length === 1) {
        next[0] = { ...next[0], isDefault: true };
      }
      return next;
    });
  };

  const updateOffer = (offerId: string, updater: (current: EditableOffer) => EditableOffer) => {
    setEditableOffers((current) => current.map((offer) => (offer.id === offerId ? updater(offer) : offer)));
  };

  const removeOffer = (offerId: string) => {
    setEditableOffers((current) => {
      const next = current.filter((offer) => offer.id !== offerId);
      if (next.length > 0 && !next.some((offer) => offer.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      return next;
    });
  };

  const markDefaultOffer = (offerId: string) => {
    setEditableOffers((current) => current.map((offer) => ({ ...offer, isDefault: offer.id === offerId })));
  };

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-6 py-6">
      <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-[0_16px_48px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-4">
            <Button variant="ghost" asChild className="mt-1 rounded-2xl px-3">
              <Link to="/admin/products">
                <ArrowLeft className="mr-1 h-4 w-4" />
                返回产品中心
              </Link>
            </Button>
            <Separator orientation="vertical" className="mt-2 h-10" />
            <div className="flex min-w-0 items-center gap-4">
              {form.iconUrl ? (
                <img src={form.iconUrl} alt={form.name} className="h-16 w-16 rounded-[24px] border border-slate-200 object-cover shadow-sm" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-gradient-to-br from-primary to-blue-500 text-xl font-black text-white shadow-sm">
                  {getInitials(form.name)}
                </div>
              )}
              <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">{isCreateMode ? 'Create Product' : 'Product Detail'}</p>
              <h2 className="truncate text-[30px] font-black tracking-tight text-slate-900">{form.name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-mono text-slate-600">{effectiveProductCode || '未设置 Code'}</span>
                  <StatusPill tone={form.status === 'active' ? 'ok' : 'warn'} label={form.status === 'active' ? '可售卖' : form.status} />
                  <StatusPill tone="neutral" label={form.type === 'chrome_extension' ? 'Chrome Extension' : form.type === 'web_app' ? 'Web App' : 'Service'} />
                  <StatusPill tone="neutral" label={form.deliveryMode === 'one_click_deploy' ? '一键部署' : '免部署'} />
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">当前档案</p>
              <p className="mt-1 text-sm font-mono text-slate-700">{targetProfileCode || '待创建'}</p>
            </div>
            <Button className="h-11 rounded-2xl px-5 text-sm font-black" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="mr-1 h-4 w-4" />
              {saveMutation.isPending ? '保存中...' : '保存产品详情'}
            </Button>
          </div>
        </div>
      </section>

      {linkedApps.length > 1 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          当前产品关联了 {linkedApps.length} 个内部兼容档案。系统会优先使用 <span className="font-mono">{primaryApp?.code}</span> 作为默认档案。
        </div>
      ) : null}

      {needsDedicatedProfile ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          当前产品仍在复用共享内部档案 <span className="font-mono">{primaryApp?.code}</span>。先保存一次产品详情，系统会为当前产品生成专属档案 <span className="font-mono">{effectiveProductCode}</span>，然后再继续同步交付声明或生成密钥。
        </div>
      ) : null}

      <Tabs defaultValue="info" className="space-y-4">
        <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_12px_36px_rgba(15,23,42,0.03)]">
          <TabsList className="h-auto flex-wrap justify-start rounded-2xl bg-slate-100 p-1">
          <TabsTrigger value="info">1. 产品信息</TabsTrigger>
          <TabsTrigger value="capability">2. 产品功能 / 授权 / 价格</TabsTrigger>
          {form.deliveryMode === 'one_click_deploy' ? (
            <TabsTrigger value="delivery">3. 交付与接入</TabsTrigger>
          ) : null}
          </TabsList>
        </div>

        <TabsContent value="info" className="space-y-4">
          <Card className="rounded-[28px] border-slate-200 shadow-[0_16px_48px_rgba(15,23,42,0.04)]">
            <CardHeader>
              <CardTitle>基本信息</CardTitle>
              <CardDescription>先定义产品名称、图标、简介、开发者、版本和介绍内容，确保产品的对外表达完整清晰。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-[140px,1fr]">
                <div className="space-y-2">
                  <Label>产品图标</Label>
                  {form.iconUrl ? (
                    <img src={form.iconUrl} alt={form.name} className="h-28 w-28 rounded-3xl border border-border object-cover" />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded-3xl border border-dashed border-border bg-muted/20 text-2xl font-black text-muted-foreground">
                      {getInitials(form.name)}
                    </div>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label>产品 Code</Label>
                    <Input
                      value={form.code}
                      onChange={(event) => setForm((current) => current ? { ...current, code: slugify(event.target.value) } : current)}
                      placeholder="fd_retail"
                      disabled={!isCreateMode}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>产品名称</Label>
                    <Input value={form.name} onChange={(event) => setForm((current) => current ? { ...current, name: event.target.value } : current)} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>产品图标 URL</Label>
                    <Input value={form.iconUrl} onChange={(event) => setForm((current) => current ? { ...current, iconUrl: event.target.value } : current)} placeholder="https://..." />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>产品简介</Label>
                    <Textarea
                      value={form.shortDescription}
                      onChange={(event) => setForm((current) => current ? { ...current, shortDescription: event.target.value } : current)}
                      placeholder="一句话介绍产品核心价值，建议 50 字以内。"
                      className="min-h-[84px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>开发者 / 开发商</Label>
                    <Input value={form.developer} onChange={(event) => setForm((current) => current ? { ...current, developer: event.target.value } : current)} placeholder="FutureDecade" />
                  </div>
                  <div className="space-y-2">
                    <Label>版本号</Label>
                    <Input value={form.version} onChange={(event) => setForm((current) => current ? { ...current, version: event.target.value } : current)} placeholder="1.0.0" />
                  </div>
                  <div className="space-y-2">
                    <Label>更新日期</Label>
                    <Input type="date" value={form.updateDate} onChange={(event) => setForm((current) => current ? { ...current, updateDate: event.target.value } : current)} />
                  </div>
                  <div className="space-y-2">
                    <Label>产品分类</Label>
                    <Input value={form.category} onChange={(event) => setForm((current) => current ? { ...current, category: event.target.value } : current)} placeholder="如 retail / commerce / content" />
                  </div>
                  <div className="space-y-2">
                    <Label>产品形态</Label>
                    <Select value={form.type} onValueChange={(value) => setForm((current) => current ? { ...current, type: value as WorkspaceForm['type'] } : current)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chrome_extension">Chrome Extension</SelectItem>
                        <SelectItem value="web_app">Web App</SelectItem>
                        <SelectItem value="service">Service</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>交付类型</Label>
                    <Select value={form.deliveryMode} onValueChange={(value) => setForm((current) => current ? { ...current, deliveryMode: value as WorkspaceForm['deliveryMode'] } : current)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="direct_access">免部署</SelectItem>
                        <SelectItem value="one_click_deploy">一键部署</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>售卖状态</Label>
                    <Select value={form.status} onValueChange={(value) => setForm((current) => current ? { ...current, status: value as WorkspaceForm['status'] } : current)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr,280px]">
                <div className="space-y-2">
                  <Label>产品介绍</Label>
                  <Textarea
                    value={form.content}
                    onChange={(event) => setForm((current) => current ? { ...current, content: event.target.value } : current)}
                    placeholder="详细介绍这个产品解决什么问题、适合谁、怎么交付。"
                    className="min-h-[260px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>封面图 URL</Label>
                  <Input value={form.coverUrl} onChange={(event) => setForm((current) => current ? { ...current, coverUrl: event.target.value } : current)} placeholder="https://..." />
                  {form.coverUrl ? (
                    <img src={form.coverUrl} alt={form.name} className="h-48 w-full rounded-2xl border border-border object-cover" />
                  ) : (
                    <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
                      暂无封面图
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capability" className="space-y-4">
          <Card className="rounded-[28px] border-slate-200 shadow-[0_16px_48px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>产品功能特性</CardTitle>
                <CardDescription>面向用户展示产品卖点，决定前台详情页看到的功能亮点。</CardDescription>
              </div>
              <Button variant="outline" onClick={addMarketingFeature}>
                <Plus className="mr-1 h-4 w-4" />
                添加产品功能
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {marketingFeatures.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
                  还没有面向用户展示的产品功能特性。
                </div>
              ) : (
                marketingFeatures.map((feature, index) => (
                  <div key={feature.id} className="space-y-4 rounded-2xl border border-border bg-muted/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-foreground">产品功能 {index + 1}</p>
                      <Button variant="ghost" size="icon" onClick={() => removeMarketingFeature(feature.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-[120px,1fr]">
                      <div className="space-y-2">
                        <Label>图标</Label>
                        <Input value={feature.icon} onChange={(event) => updateMarketingFeature(feature.id, (current) => ({ ...current, icon: event.target.value }))} placeholder="✨" />
                      </div>
                      <div className="space-y-2">
                        <Label>标题</Label>
                        <Input value={feature.title} onChange={(event) => updateMarketingFeature(feature.id, (current) => ({ ...current, title: event.target.value }))} placeholder="例如：实时同步" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>描述</Label>
                      <Textarea value={feature.description} onChange={(event) => updateMarketingFeature(feature.id, (current) => ({ ...current, description: event.target.value }))} className="min-h-[88px]" />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-slate-200 shadow-[0_16px_48px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>授权能力项</CardTitle>
                <CardDescription>定义用户买到产品后，会获得哪些授权能力。这是授权引擎的底层能力单元。</CardDescription>
              </div>
              <Button variant="outline" onClick={addCapabilityFeature}>
                <Plus className="mr-1 h-4 w-4" />
                添加授权能力
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {capabilityFeatures.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
                  至少需要一个授权能力项，产品才能形成可售卖的授权方案。
                </div>
              ) : (
                capabilityFeatures.map((feature, index) => (
                  <div key={feature.id} className="space-y-4 rounded-2xl border border-border bg-muted/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-foreground">授权能力 {index + 1}</p>
                      <Button variant="ghost" size="icon" onClick={() => removeCapabilityFeature(feature.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>能力名称</Label>
                        <Input value={feature.name} onChange={(event) => updateCapabilityFeature(feature.id, (current) => ({ ...current, name: event.target.value }))} placeholder="例如：System Deploy" />
                      </div>
                      <div className="space-y-2">
                        <Label>能力 Code</Label>
                        <Input value={feature.code} onChange={(event) => updateCapabilityFeature(feature.id, (current) => ({ ...current, code: slugify(event.target.value) }))} placeholder="system_deploy" />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>能力类型</Label>
                        <Select value={feature.kind} onValueChange={(value) => updateCapabilityFeature(feature.id, (current) => ({ ...current, kind: value }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {capabilityKindOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>状态</Label>
                        <Select value={feature.status} onValueChange={(value) => updateCapabilityFeature(feature.id, (current) => ({ ...current, status: value as EditableCapabilityFeature['status'] }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                            <SelectItem value="expired">Expired</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-slate-200 shadow-[0_16px_48px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>基础授权 Plan</CardTitle>
                <CardDescription>Plan 由授权能力、授权种类和价格共同构成。支付方式由结算页让用户自行选择，这里不再单独配置。</CardDescription>
              </div>
              <Button variant="outline" onClick={addBasePlan}>
                <Plus className="mr-1 h-4 w-4" />
                添加基础 Plan
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {basePlans.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
                  至少需要一个基础 Plan，产品才能形成完整的授权和价格体系。
                </div>
              ) : (
                basePlans.map((plan, index) => (
                  <div key={plan.id} className="space-y-4 rounded-2xl border border-border bg-muted/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-foreground">基础 Plan {index + 1}</p>
                      <Button variant="ghost" size="icon" onClick={() => removeBasePlan(plan.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Plan 名称</Label>
                        <Input value={plan.name} onChange={(event) => updateBasePlan(plan.id, (current) => ({ ...current, name: event.target.value }))} placeholder="例如：专业版年付" />
                      </div>
                      <div className="space-y-2">
                        <Label>Plan Code</Label>
                        <Input value={plan.code} onChange={(event) => updateBasePlan(plan.id, (current) => ({ ...current, code: slugify(event.target.value) }))} placeholder="retail_pro_yearly" />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>授权种类</Label>
                        <Select value={plan.interval} onValueChange={(value) => updateBasePlan(plan.id, (current) => ({ ...current, interval: value as EditableBasePlan['interval'] }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {authorizationIntervalOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>价格（元）</Label>
                        <Input value={plan.priceYuan} onChange={(event) => updateBasePlan(plan.id, (current) => ({ ...current, priceYuan: event.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>状态</Label>
                        <Select value={plan.status} onValueChange={(value) => updateBasePlan(plan.id, (current) => ({ ...current, status: value as EditableBasePlan['status'] }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                            <SelectItem value="expired">Expired</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>币种</Label>
                        <Input value={plan.currency} onChange={(event) => updateBasePlan(plan.id, (current) => ({ ...current, currency: event.target.value.toUpperCase() }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>已关联能力数</Label>
                        <div className="flex h-10 items-center rounded-xl border border-input bg-background px-3 text-sm text-muted-foreground">
                          {plan.featureIds.length} 个授权能力
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>授权能力组合</Label>
                      <div className="grid gap-3 rounded-2xl border border-border bg-white p-4 md:grid-cols-2">
                        {capabilityFeatures.map((feature) => (
                          <label key={feature.id} className="flex items-start gap-3 rounded-xl border border-border px-3 py-2">
                            <Checkbox
                              checked={plan.featureIds.includes(feature.id)}
                              onCheckedChange={(checked) =>
                                updateBasePlan(plan.id, (current) => ({
                                  ...current,
                                  featureIds: checked
                                    ? [...new Set([...current.featureIds, feature.id])]
                                    : current.featureIds.filter((item) => item !== feature.id)
                                }))
                              }
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-bold text-foreground">{feature.name || '未命名能力'}</span>
                              <span className="block text-xs font-mono text-muted-foreground">{feature.code || '待生成 code'}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>对外销售方案</CardTitle>
                <CardDescription>基础 Plan 决定授权与价格底座；这里定义用户最终看到的标题、标签和默认购买入口。</CardDescription>
              </div>
              <Button variant="outline" onClick={addOffer} disabled={basePlans.length === 0}>
                <Plus className="mr-1 h-4 w-4" />
                添加销售方案
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {basePlans.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
                  先定义基础 Plan，再配置对外销售方案。
                </div>
              ) : editableOffers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
                  还没有自定义销售方案。保存后前台会回退到基础 Plan 的默认展示。
                </div>
              ) : (
                editableOffers.map((offer) => {
                  const boundPlan = basePlans.find((plan) => slugify(plan.code || plan.name) === offer.planCode) ?? null;

                  return (
                    <div key={offer.id} className="space-y-4 rounded-2xl border border-border bg-muted/10 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-foreground">{offer.title || '未命名销售方案'}</p>
                          <p className="text-xs text-muted-foreground">
                            绑定基础 Plan：{boundPlan ? `${boundPlan.name} · ${formatPlanInterval(boundPlan.interval)}` : offer.planCode || '未选择'}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeOffer(offer.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>方案标题</Label>
                          <Input value={offer.title} onChange={(event) => updateOffer(offer.id, (current) => ({ ...current, title: event.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>展示 Code</Label>
                          <Input value={offer.code} onChange={(event) => updateOffer(offer.id, (current) => ({ ...current, code: slugify(event.target.value) }))} />
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-4">
                        <div className="space-y-2 md:col-span-2">
                          <Label>绑定基础 Plan</Label>
                          <Select value={offer.planCode} onValueChange={(value) => updateOffer(offer.id, (current) => ({ ...current, planCode: value }))}>
                            <SelectTrigger>
                              <SelectValue placeholder="选择基础 Plan" />
                            </SelectTrigger>
                            <SelectContent>
                              {basePlans
                                .filter((plan) => slugify(plan.code || plan.name))
                                .map((plan) => (
                                  <SelectItem key={plan.id} value={slugify(plan.code || plan.name)}>
                                    {plan.name || plan.code || '未命名'} ({formatPlanInterval(plan.interval)})
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>展示价格（元）</Label>
                          <Input value={offer.priceYuan} onChange={(event) => updateOffer(offer.id, (current) => ({ ...current, priceYuan: event.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>状态</Label>
                          <Select value={offer.status} onValueChange={(value) => updateOffer(offer.id, (current) => ({ ...current, status: value as EditableOffer['status'] }))}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                              <SelectItem value="expired">Expired</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>标签</Label>
                          <Input value={offer.badge} onChange={(event) => updateOffer(offer.id, (current) => ({ ...current, badge: event.target.value }))} placeholder="例如 推荐 / 企业版" />
                        </div>
                        <div className="space-y-2">
                          <Label>默认购买入口</Label>
                          <div className="flex h-10 items-center gap-3 rounded-xl border border-input bg-background px-3">
                            <input type="radio" checked={offer.isDefault} onChange={() => markDefaultOffer(offer.id)} />
                            <span className="text-sm text-muted-foreground">设为默认购买入口</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>说明</Label>
                        <Textarea value={offer.description} onChange={(event) => updateOffer(offer.id, (current) => ({ ...current, description: event.target.value }))} className="min-h-[88px]" />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {form.deliveryMode === 'one_click_deploy' ? (
        <TabsContent value="delivery" className="space-y-4">
          {form.deliveryMode === 'one_click_deploy' ? (
          <Card className="rounded-[28px] border-slate-200 shadow-[0_16px_48px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>交付声明来源</CardTitle>
                <CardDescription>这里定义在线访问、自行安装或一键部署的来源仓库和 manifest 位置。</CardDescription>
              </div>
              <Button
                variant="outline"
                disabled={syncManifestMutation.isPending || !deliverySource.repoUrl.trim() || !primaryApp || needsDedicatedProfile}
                onClick={() => syncManifestMutation.mutate()}
              >
                {syncManifestMutation.isPending ? '同步中...' : '同步交付声明'}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>仓库 URL</Label>
                  <Input value={deliverySource.repoUrl} onChange={(event) => setDeliverySource((current) => ({ ...current, repoUrl: event.target.value }))} placeholder="https://github.com/FutureDecade/fd-retail-system.git" />
                </div>
                <div className="space-y-2">
                  <Label>仓库分支</Label>
                  <Input value={deliverySource.repoBranch} onChange={(event) => setDeliverySource((current) => ({ ...current, repoBranch: event.target.value }))} placeholder="main" />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Manifest Path</Label>
                  <Input value={deliverySource.manifestPath} onChange={(event) => setDeliverySource((current) => ({ ...current, manifestPath: event.target.value }))} placeholder="fd-delivery.manifest.json" />
                </div>
                <div className="space-y-2">
                  <Label>Manifest URL（可选）</Label>
                  <Input value={deliverySource.manifestUrl} onChange={(event) => setDeliverySource((current) => ({ ...current, manifestUrl: event.target.value }))} placeholder="https://raw.githubusercontent.com/..." />
                </div>
              </div>
              <div className="rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
                {!primaryApp
                  ? '请先保存产品详情。保存后系统会为当前产品创建或更新内部兼容档案，随后才能同步交付声明。'
                  : needsDedicatedProfile
                  ? `当前产品仍在复用共享内部档案 ${primaryApp.code}。请先保存一次产品详情，生成专属档案后再同步交付声明。`
                  : hasDeliveryManifest
                  ? `当前已同步交付声明，底层档案 code 为 ${targetProfileCode}。`
                  : '当前尚未同步交付声明。先填写仓库 URL，再执行同步。'}
              </div>
            </CardContent>
          </Card>
          ) : null}

          {form.deliveryMode === 'one_click_deploy' ? (
          <Card className="rounded-[28px] border-slate-200 shadow-[0_16px_48px_rgba(15,23,42,0.04)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="h-4 w-4" />
                交付配置
              </CardTitle>
              <CardDescription>实例级域名、环境变量覆盖值和交付预设现在直接在产品详情页内维护。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!primaryApp || needsDedicatedProfile ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
                  {needsDedicatedProfile
                    ? `当前产品仍在复用共享内部档案 ${primaryApp?.code}。请先保存产品详情，生成专属档案后再配置交付参数。`
                    : '请先保存产品详情，生成专属产品档案后再配置交付参数。'}
                </div>
              ) : deliverySettingsQuery.isLoading ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
                  加载交付配置中...
                </div>
              ) : deliverySettings ? (
                <>
                  {deliverySettings.manifest.domainSlots.length > 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/10 p-4">
                      <h3 className="text-sm font-black">终端用户部署域名</h3>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        {deliverySettings.manifest.domainSlots.map((slot) => (
                          <div key={slot.key} className="rounded-xl border border-border bg-white px-3 py-3">
                            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">{slot.label}</p>
                            <p className="mt-1 text-sm font-bold text-foreground">{slot.envKey}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{slot.placeholder ?? '由部署实例填写'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {deliveryGroupMap.map(({ group, env, secret }) => (
                    <div key={group.key} className="rounded-2xl border border-border bg-muted/10 p-4">
                      <div className="mb-4">
                        <h3 className="text-sm font-black">{group.label}</h3>
                        {group.description ? <p className="mt-1 text-xs text-muted-foreground">{group.description}</p> : null}
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        {env.map((field) => (
                          <div key={field.key} className="space-y-2">
                            <Label>
                              {field.label}
                              {field.required ? <span className="ml-1 text-red-500">*</span> : null}
                            </Label>
                            {field.type === 'boolean' ? (
                              <div className="flex items-center gap-3 rounded-xl border border-border bg-white px-3 py-2">
                                <Checkbox
                                  checked={draftValues[field.key] === true}
                                  onCheckedChange={(checked) =>
                                    setDraftValues((current) => ({ ...current, [field.key]: Boolean(checked) }))
                                  }
                                />
                                <span className="text-sm text-muted-foreground">{field.description ?? '开关型预设'}</span>
                              </div>
                            ) : (
                              <Input
                                type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
                                value={typeof draftValues[field.key] === 'string' ? String(draftValues[field.key]) : ''}
                                placeholder={field.placeholder ?? undefined}
                                onChange={(event) =>
                                  setDraftValues((current) => ({ ...current, [field.key]: event.target.value }))
                                }
                              />
                            )}
                            <div className="flex items-center gap-2">
                              <StatusPill
                                tone={field.scope === 'user_input' ? 'warn' : 'neutral'}
                                label={getDeliveryScopeLabel(field.scope, field.advanced)}
                              />
                              {field.defaultValue !== null && field.defaultValue !== undefined ? (
                                <span className="text-xs text-muted-foreground">默认值：{String(field.defaultValue)}</span>
                              ) : null}
                            </div>
                            {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
                          </div>
                        ))}

                        {secret.map((field) => (
                          <div key={field.key} className="space-y-2">
                            <Label>
                              {field.label}
                              {field.required ? <span className="ml-1 text-red-500">*</span> : null}
                            </Label>
                            <Input
                              type="password"
                              value={draftSecrets[field.key] ?? ''}
                              placeholder={
                                deliverySettings.secrets[field.key]?.configured
                                  ? '已保存，留空保持不变'
                                  : field.placeholder ?? '当前未配置'
                              }
                              onChange={(event) =>
                                setDraftSecrets((current) => ({ ...current, [field.key]: event.target.value }))
                              }
                            />
                            <div className="flex items-center gap-2">
                              <StatusPill
                                tone={deliverySettings.secrets[field.key]?.configured ? 'ok' : 'warn'}
                                label={deliverySettings.secrets[field.key]?.configured ? '已保存' : '待填写'}
                              />
                              <StatusPill
                                tone={field.scope === 'user_input' ? 'warn' : 'neutral'}
                                label={getDeliveryScopeLabel(field.scope, field.advanced)}
                              />
                            </div>
                            {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {deliverySettings.manifest.notes?.length ? (
                    <div className="rounded-2xl border border-border bg-muted/10 p-4">
                      <h3 className="text-sm font-black">交付说明</h3>
                      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                        {deliverySettings.manifest.notes.map((note) => (
                          <li key={note}>• {note}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <Button onClick={() => saveDeliveryMutation.mutate()} disabled={saveDeliveryMutation.isPending}>
                      {saveDeliveryMutation.isPending ? '保存中...' : '保存交付配置'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => clearDeliveryMutation.mutate()}
                      disabled={clearDeliveryMutation.isPending || saveDeliveryMutation.isPending}
                    >
                      清空覆盖值
                    </Button>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
                  暂无交付配置，请先同步交付声明。
                </div>
              )}
            </CardContent>
          </Card>
          ) : null}

        </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
