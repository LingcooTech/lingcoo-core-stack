import { ArrowLeft } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { listAppsAdmin, listCatalogSnapshot, syncAppDeliveryManifest, upsertApp } from '@/api/apps';
import { clearDeliverySettings, getDeliverySettings, upsertDeliverySettings } from '@/api/delivery';
import type { AppWithDetails } from '@/api/types';
import { AppEditBasicsTab } from '@/components/apps/app-edit/AppEditBasicsTab';
import { AppEditContentTab } from '@/components/apps/app-edit/AppEditContentTab';
import { AppEditDeliveryTab } from '@/components/apps/app-edit/AppEditDeliveryTab';
import { AppEditHeader } from '@/components/apps/app-edit/AppEditHeader';
import { AppEditOffersTab } from '@/components/apps/app-edit/AppEditOffersTab';
import { AppEditFeaturesTab, AppEditPlansTab } from '@/components/apps/app-edit/AppEditPlansTab';
import {
  EMPTY_FORM_STATE,
  buildSaveRequest,
  createDraftId,
  createEditableFeatures,
  createEditableOffers,
  createEditablePlans,
  createFormState,
  formatPriceYuan,
  serializeDraft,
  slugify,
  toPlanSummary,
  validateDraft,
  type AppEditTabKey,
  type EditableFeature,
  type EditableOffer,
  type EditablePlan,
  type FormState,
  type SaveRequest,
} from '@/components/apps/app-edit/model';
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { useUnsavedChangesPrompt } from '@/hooks/useUnsavedChangesPrompt';
import {
  buildDeliverySettingsPayload,
  buildDeliveryManifestSourcePayload,
  createDeliveryManifestSourceDraft,
  createDeliverySecretState,
  createDeliverySettingsDraft,
  getDeliveryManifest,
  serializeDeliveryManifestSourceDraft,
  serializeDeliverySettingsDraft,
  type DeliveryManifestSourceDraft,
  type DeliverySecretState,
  type DeliverySettingsDraft,
} from '@/lib/app-delivery';

interface SaveMutationRequest {
  appRequest: SaveRequest;
  saveDeliverySettings: boolean;
  deliveryDraft: DeliverySettingsDraft;
}

interface SyncManifestResult {
  app: AppWithDetails;
  deliveryOverview: Awaited<ReturnType<typeof getDeliverySettings>>;
}

interface SyncManifestRequest {
  appCode: string;
  payload: {
    repoUrl?: string;
    repoBranch?: string;
    manifestPath?: string;
    manifestUrl?: string;
  };
  snapshot: string;
}

function ensureDefaultOffer(offers: EditableOffer[]) {
  if (offers.length === 0) {
    return offers;
  }

  const defaultCount = offers.filter((offer) => offer.isDefault).length;
  if (defaultCount === 1) {
    return offers;
  }

  return offers.map((offer, index) => ({ ...offer, isDefault: index === 0 }));
}

function replaceAppInList(current: { items: AppWithDetails[] } | undefined, next: AppWithDetails) {
  const items = current?.items ?? [];
  const existingIndex = items.findIndex((item) => item.id === next.id || item.code === next.code);

  if (existingIndex === -1) {
    return { items: [next, ...items] };
  }

  return {
    items: items.map((item, index) => (index === existingIndex ? next : item)),
  };
}

function buildDraftSnapshot(
  form: FormState,
  editableFeatures: EditableFeature[],
  editablePlans: EditablePlan[],
  editableOffers: EditableOffer[],
  deliverySettings: DeliverySettingsDraft,
  deliverySecrets: DeliverySecretState,
) {
  return serializeDraft(form, editableFeatures, editablePlans, editableOffers, {
    delivery: serializeDeliverySettingsDraft(form.deliveryMode, deliverySettings, deliverySecrets),
  });
}

export function AppEditPage() {
  const { appCode } = useParams<{ appCode: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isCreateMode = !appCode;

  const [activeTab, setActiveTab] = useState<AppEditTabKey>('basics');
  const [form, setForm] = useState<FormState>(EMPTY_FORM_STATE);
  const [editableFeatures, setEditableFeatures] = useState<EditableFeature[]>([]);
  const [editablePlans, setEditablePlans] = useState<EditablePlan[]>([]);
  const [editableOffers, setEditableOffers] = useState<EditableOffer[]>([]);
  const [deliverySettings, setDeliverySettings] = useState<DeliverySettingsDraft>(
    createDeliverySettingsDraft(undefined, null),
  );
  const [manifestSource, setManifestSource] = useState<DeliveryManifestSourceDraft>(
    createDeliveryManifestSourceDraft(),
  );
  const [deliverySecrets, setDeliverySecrets] = useState<DeliverySecretState>(
    createDeliverySecretState(undefined, null),
  );
  const [initialized, setInitialized] = useState(false);
  const [savedDraftSnapshot, setSavedDraftSnapshot] = useState('');
  const [savedManifestSourceSnapshot, setSavedManifestSourceSnapshot] = useState('');
  const [allowNavigation, setAllowNavigation] = useState(false);

  const { data: appsData, isLoading: isAppsLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: listAppsAdmin,
  });

  const { data: catalogData, isFetched: isCatalogFetched } = useQuery({
    queryKey: ['catalog'],
    queryFn: listCatalogSnapshot,
  });

  const deliverySettingsQuery = useQuery({
    queryKey: ['delivery-settings', appCode],
    queryFn: () => getDeliverySettings(appCode!),
    enabled: Boolean(appCode),
  });

  const app = useMemo(
    () =>
      isCreateMode ? null : ((appsData?.items ?? []).find((item) => item.code === appCode) ?? null),
    [appsData, appCode, isCreateMode],
  );

  const appPlanFeatures = useMemo(() => {
    if (!app) {
      return [];
    }

    const planIds = new Set((app.plans ?? []).map((plan) => plan.id));
    const featureIds = new Set((app.features ?? []).map((feature) => feature.id));

    return (catalogData?.planFeatures ?? []).filter(
      (mapping) => planIds.has(mapping.planId) && featureIds.has(mapping.featureId),
    );
  }, [app, catalogData?.planFeatures]);

  const existingAppCodes = useMemo(
    () => new Set((appsData?.items ?? []).map((item) => item.code)),
    [appsData?.items],
  );
  const manifest = useMemo(() => getDeliveryManifest(app), [app]);

  const showDeliveryTab = form.deliveryMode === 'one_click';
  const visibleTabKeys: AppEditTabKey[] = showDeliveryTab
    ? ['basics', 'content', 'delivery', 'features', 'plans', 'offers']
    : ['basics', 'content', 'features', 'plans', 'offers'];

  useEffect(() => {
    setActiveTab('basics');
    setAllowNavigation(false);

    if (isCreateMode) {
      const emptyDeliverySettings = createDeliverySettingsDraft(undefined, null);
      const emptyDeliverySecrets = createDeliverySecretState(undefined, null);
      const emptyManifestSource = createDeliveryManifestSourceDraft();
      setForm(EMPTY_FORM_STATE);
      setEditableFeatures([]);
      setEditablePlans([]);
      setEditableOffers([]);
      setDeliverySettings(emptyDeliverySettings);
      setManifestSource(emptyManifestSource);
      setDeliverySecrets(emptyDeliverySecrets);
      setSavedDraftSnapshot(
        buildDraftSnapshot(
          EMPTY_FORM_STATE,
          [],
          [],
          [],
          emptyDeliverySettings,
          emptyDeliverySecrets,
        ),
      );
      setSavedManifestSourceSnapshot(serializeDeliveryManifestSourceDraft(emptyManifestSource));
      setInitialized(true);
      return;
    }

    setForm(EMPTY_FORM_STATE);
    setEditableFeatures([]);
    setEditablePlans([]);
    setEditableOffers([]);
    setDeliverySettings(createDeliverySettingsDraft(undefined, null));
    setManifestSource(createDeliveryManifestSourceDraft());
    setDeliverySecrets(createDeliverySecretState(undefined, null));
    setSavedDraftSnapshot('');
    setSavedManifestSourceSnapshot('');
    setInitialized(false);
  }, [appCode, isCreateMode]);

  useEffect(() => {
    if (
      isCreateMode ||
      !app ||
      initialized ||
      !isCatalogFetched ||
      !deliverySettingsQuery.isFetched
    ) {
      return;
    }

    const nextForm = createFormState(app);
    const nextFeatures = createEditableFeatures(app);
    const nextPlans = createEditablePlans(app, appPlanFeatures);
    const nextOffers = createEditableOffers(app);
    const nextDeliverySettings = createDeliverySettingsDraft(deliverySettingsQuery.data, manifest);
    const nextManifestSource = createDeliveryManifestSourceDraft(app);
    const nextDeliverySecrets = createDeliverySecretState(deliverySettingsQuery.data, manifest);

    setForm(nextForm);
    setEditableFeatures(nextFeatures);
    setEditablePlans(nextPlans);
    setEditableOffers(nextOffers);
    setDeliverySettings(nextDeliverySettings);
    setManifestSource(nextManifestSource);
    setDeliverySecrets(nextDeliverySecrets);
    setSavedDraftSnapshot(
      buildDraftSnapshot(
        nextForm,
        nextFeatures,
        nextPlans,
        nextOffers,
        nextDeliverySettings,
        nextDeliverySecrets,
      ),
    );
    setSavedManifestSourceSnapshot(serializeDeliveryManifestSourceDraft(nextManifestSource));
    setInitialized(true);
  }, [
    app,
    appPlanFeatures,
    deliverySettingsQuery.data,
    deliverySettingsQuery.isFetched,
    initialized,
    isCatalogFetched,
    isCreateMode,
    manifest,
  ]);

  useEffect(() => {
    if (!showDeliveryTab && activeTab === 'delivery') {
      setActiveTab('basics');
    }
  }, [activeTab, showDeliveryTab]);

  const availablePlans = useMemo(
    () =>
      editablePlans
        .map((plan) => toPlanSummary(plan, app?.id))
        .sort((left, right) => left.code.localeCompare(right.code)),
    [app?.id, editablePlans],
  );

  const availablePlanMap = useMemo(
    () => new Map(availablePlans.map((plan) => [plan.code, plan])),
    [availablePlans],
  );

  const currentSnapshot = useMemo(
    () =>
      buildDraftSnapshot(
        form,
        editableFeatures,
        editablePlans,
        editableOffers,
        deliverySettings,
        deliverySecrets,
      ),
    [deliverySecrets, deliverySettings, editableFeatures, editableOffers, editablePlans, form],
  );
  const currentManifestSourceSnapshot = useMemo(
    () => serializeDeliveryManifestSourceDraft(manifestSource),
    [manifestSource],
  );

  const hasUnsavedChanges =
    initialized &&
    !allowNavigation &&
    (currentSnapshot !== savedDraftSnapshot ||
      currentManifestSourceSnapshot !== savedManifestSourceSnapshot);
  const { isDialogOpen, confirmNavigation, stayOnPage } =
    useUnsavedChangesPrompt(hasUnsavedChanges);

  const saveMutation = useMutation({
    mutationFn: async ({
      appRequest,
      saveDeliverySettings,
      deliveryDraft,
    }: SaveMutationRequest) => {
      const appResult = await upsertApp(appRequest.appCode, appRequest.payload);
      const deliveryOverview = saveDeliverySettings
        ? await upsertDeliverySettings(appResult.code, buildDeliverySettingsPayload(deliveryDraft))
        : null;

      return { app: appResult, deliveryOverview };
    },
    onSuccess: ({ app: result, deliveryOverview }) => {
      const nextManifest = getDeliveryManifest(result);
      const nextDeliverySettings = deliveryOverview
        ? createDeliverySettingsDraft(deliveryOverview, nextManifest)
        : deliverySettings;
      const nextDeliverySecrets = deliveryOverview
        ? createDeliverySecretState(deliveryOverview, nextManifest)
        : deliverySecrets;
      const nextSnapshot = buildDraftSnapshot(
        form,
        editableFeatures,
        editablePlans,
        editableOffers,
        nextDeliverySettings,
        nextDeliverySecrets,
      );

      flushSync(() => {
        setSavedDraftSnapshot(nextSnapshot);
        setSavedManifestSourceSnapshot(serializeDeliveryManifestSourceDraft(manifestSource));
        if (deliveryOverview) {
          setDeliverySettings(nextDeliverySettings);
          setDeliverySecrets(nextDeliverySecrets);
        }
        if (isCreateMode) {
          setAllowNavigation(true);
        }
      });

      qc.setQueryData<{ items: AppWithDetails[] } | undefined>(['apps'], (current) =>
        replaceAppInList(current, result),
      );

      void qc.invalidateQueries({ queryKey: ['apps'] });
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      if (deliveryOverview) {
        qc.setQueryData(['delivery-settings', result.code], deliveryOverview);
      } else if (!isCreateMode && appCode) {
        void qc.invalidateQueries({ queryKey: ['delivery-settings', appCode] });
      }

      toast.success(isCreateMode ? '应用已创建' : '应用配置已保存');

      if (isCreateMode) {
        navigate(`/admin/apps/${result.code}/edit`, { replace: true });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '保存失败');
    },
  });

  const syncManifestMutation = useMutation({
    mutationFn: async ({
      appCode: targetAppCode,
      payload,
    }: SyncManifestRequest): Promise<SyncManifestResult> => {
      const syncedApp = await syncAppDeliveryManifest(targetAppCode, payload);
      const deliveryOverview = await getDeliverySettings(targetAppCode);
      return { app: syncedApp, deliveryOverview };
    },
    onSuccess: ({ app: result, deliveryOverview }, variables) => {
      const nextManifest = getDeliveryManifest(result);
      const nextDeliverySettings = createDeliverySettingsDraft(deliveryOverview, nextManifest);
      const nextDeliverySecrets = createDeliverySecretState(deliveryOverview, nextManifest);

      setDeliverySettings(nextDeliverySettings);
      setDeliverySecrets(nextDeliverySecrets);
      setSavedManifestSourceSnapshot(variables.snapshot);
      setSavedDraftSnapshot(
        buildDraftSnapshot(
          form,
          editableFeatures,
          editablePlans,
          editableOffers,
          nextDeliverySettings,
          nextDeliverySecrets,
        ),
      );
      qc.setQueryData<{ items: AppWithDetails[] } | undefined>(['apps'], (current) =>
        replaceAppInList(current, result),
      );
      qc.setQueryData(['delivery-settings', variables.appCode], deliveryOverview);
      void qc.invalidateQueries({ queryKey: ['apps'] });
      toast.success('交付 Manifest 已同步，预设版本已刷新且密钥状态已保留');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '同步交付 Manifest 失败');
    },
  });

  const clearDeliveryMutation = useMutation({
    mutationFn: async (targetAppCode: string) => {
      await clearDeliverySettings(targetAppCode);
      return targetAppCode;
    },
    onSuccess: (targetAppCode) => {
      const nextDeliverySettings = createDeliverySettingsDraft(undefined, manifest);
      const nextDeliverySecrets = createDeliverySecretState(undefined, manifest);

      setDeliverySettings(nextDeliverySettings);
      setDeliverySecrets(nextDeliverySecrets);
      setSavedDraftSnapshot(
        buildDraftSnapshot(
          form,
          editableFeatures,
          editablePlans,
          editableOffers,
          nextDeliverySettings,
          nextDeliverySecrets,
        ),
      );

      void qc.invalidateQueries({ queryKey: ['delivery-settings', targetAppCode] });
      toast.success('交付配置已清空');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '清空交付配置失败');
    },
  });

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setDeliveryField = (key: string, value: string | boolean) => {
    setDeliverySettings((prev) => ({
      ...prev,
      values: {
        ...prev.values,
        [key]: value,
      },
    }));
  };

  const setDeliverySecretField = (key: string, value: string) => {
    setDeliverySettings((prev) => ({
      ...prev,
      secrets: {
        ...prev.secrets,
        [key]: value,
      },
    }));
  };

  const setManifestField = <K extends keyof DeliveryManifestSourceDraft>(
    key: K,
    value: DeliveryManifestSourceDraft[K],
  ) => {
    setManifestSource((prev) => ({ ...prev, [key]: value }));
  };

  const updateFeature = (
    featureId: string,
    updater: (feature: EditableFeature) => EditableFeature,
  ) => {
    setEditableFeatures((prev) => {
      let previousCode = '';
      let nextCode = '';

      const next = prev.map((feature) => {
        if (feature.id !== featureId) {
          return feature;
        }

        previousCode = feature.code;
        const updated = updater(feature);
        nextCode = updated.code;
        return updated;
      });

      if (previousCode !== nextCode) {
        setEditablePlans((plans) =>
          plans.map((plan) => ({
            ...plan,
            featureCodes: plan.featureCodes.map((code) =>
              code === previousCode ? nextCode : code,
            ),
          })),
        );
      }

      return next;
    });
  };

  const addFeature = () => {
    setEditableFeatures((prev) => [
      ...prev,
      {
        id: createDraftId('feature'),
        code: `feature_${prev.length + 1}`,
        name: '',
        kind: 'boolean',
        status: 'active',
      },
    ]);
  };

  const removeFeature = (featureId: string) => {
    setEditableFeatures((prev) => {
      const removed = prev.find((feature) => feature.id === featureId);
      const next = prev.filter((feature) => feature.id !== featureId);

      if (removed) {
        setEditablePlans((plans) =>
          plans.map((plan) => ({
            ...plan,
            featureCodes: plan.featureCodes.filter((code) => code !== removed.code),
          })),
        );
      }

      return next;
    });
  };

  const updatePlan = (planId: string, updater: (plan: EditablePlan) => EditablePlan) => {
    setEditablePlans((prev) => {
      let previousCode = '';
      let nextCode = '';

      const next = prev.map((plan) => {
        if (plan.id !== planId) {
          return plan;
        }

        previousCode = plan.code;
        const updated = updater(plan);
        nextCode = updated.code;
        return updated;
      });

      if (previousCode !== nextCode) {
        setEditableOffers((offers) =>
          offers.map((offer) =>
            offer.planCode === previousCode ? { ...offer, planCode: nextCode } : offer,
          ),
        );
      }

      return next;
    });
  };

  const addPlan = () => {
    const firstFeatureCode = editableFeatures[0]?.code ?? '';
    setEditablePlans((prev) => [
      ...prev,
      {
        id: createDraftId('plan'),
        code: `plan_${prev.length + 1}`,
        name: '',
        billingProvider: 'self_hosted',
        billingPriceId: '',
        priceYuan: '0.00',
        currency: 'CNY',
        interval: 'month',
        status: 'active',
        featureCodes: firstFeatureCode ? [firstFeatureCode] : [],
        deploymentPolicy: {
          maxActiveDeployments: 1,
          domainBindingMode: 'none',
          domainBindingSource: 'none',
          domainBindingScope: 'registrable_domain',
          allowMultiplePurchases: false,
        },
      },
    ]);
  };

  const removePlan = (planId: string) => {
    setEditablePlans((prev) => {
      const removed = prev.find((plan) => plan.id === planId);
      const next = prev.filter((plan) => plan.id !== planId);

      if (removed) {
        setEditableOffers((offers) =>
          ensureDefaultOffer(offers.filter((offer) => offer.planCode !== removed.code)),
        );
      }

      return next;
    });
  };

  const updateOffer = (offerId: string, updater: (offer: EditableOffer) => EditableOffer) => {
    setEditableOffers((prev) =>
      ensureDefaultOffer(prev.map((offer) => (offer.id === offerId ? updater(offer) : offer))),
    );
  };

  const addOffer = () => {
    const seed = availablePlans[0];
    if (!seed) {
      return;
    }

    setEditableOffers((prev) =>
      ensureDefaultOffer([
        ...prev,
        {
          id: createDraftId('offer'),
          code: slugify(seed.code || `offer_${Date.now().toString(36)}`),
          planCode: seed.code,
          title: seed.name || '',
          description: '',
          badge: '',
          priceYuan: formatPriceYuan(seed.priceAmount),
          currency: seed.currency || 'CNY',
          status: (seed.status as EditableOffer['status']) || 'active',
          isDefault: false,
        },
      ]),
    );
  };

  const removeOffer = (offerId: string) => {
    setEditableOffers((prev) => ensureDefaultOffer(prev.filter((offer) => offer.id !== offerId)));
  };

  const markDefaultOffer = (offerId: string) => {
    setEditableOffers((prev) =>
      prev.map((offer) => ({ ...offer, isDefault: offer.id === offerId })),
    );
  };

  const saveDraft = () => {
    if (isCreateMode && isAppsLoading) {
      toast.error('正在校验 App Code，请稍后再保存。');
      return;
    }

    const issue = validateDraft(form, editableFeatures, editablePlans, editableOffers);
    if (issue) {
      setActiveTab(issue.tab);
      toast.error(issue.message);
      return;
    }

    const normalizedAppCode = slugify(form.appCode);
    if (isCreateMode && existingAppCodes.has(normalizedAppCode)) {
      setActiveTab('basics');
      toast.error(`App Code 已存在：${normalizedAppCode}`);
      return;
    }

    const appRequest = buildSaveRequest(
      form,
      editableFeatures,
      editablePlans,
      editableOffers,
      app?.meta,
    );
    const manifestPayload = buildDeliveryManifestSourcePayload(manifestSource);
    const nextMeta = { ...(appRequest.payload.meta ?? {}) };

    if (Object.keys(manifestPayload).length > 0) {
      nextMeta.deliveryManifestSource = manifestPayload;
    } else {
      delete nextMeta.deliveryManifestSource;
    }

    appRequest.payload.meta = nextMeta;

    saveMutation.mutate({
      appRequest: {
        ...appRequest,
        snapshot: buildDraftSnapshot(
          form,
          editableFeatures,
          editablePlans,
          editableOffers,
          deliverySettings,
          deliverySecrets,
        ),
      },
      saveDeliverySettings: showDeliveryTab,
      deliveryDraft: deliverySettings,
    });
  };

  const handleSyncManifest = () => {
    if (isCreateMode) {
      toast.error('请先保存应用，再同步 delivery manifest。');
      return;
    }

    const targetAppCode = form.appCode.trim();
    if (!targetAppCode) {
      toast.error('缺少 App Code。');
      return;
    }

    const payload = buildDeliveryManifestSourcePayload(manifestSource);
    if (Object.keys(payload).length === 0) {
      toast.error('请先填写仓库 URL 或 Manifest URL。');
      return;
    }

    syncManifestMutation.mutate({
      appCode: targetAppCode,
      payload,
      snapshot: serializeDeliveryManifestSourceDraft(manifestSource),
    });
  };

  const hasSyncedManifest = Boolean(
    app?.meta &&
    typeof app.meta === 'object' &&
    !Array.isArray(app.meta) &&
    Object.prototype.hasOwnProperty.call(app.meta, 'deliveryManifest'),
  );
  const isBusy =
    saveMutation.isPending || clearDeliveryMutation.isPending || syncManifestMutation.isPending;

  const handleClearDelivery = () => {
    if (isCreateMode) {
      setDeliverySettings(createDeliverySettingsDraft(undefined, manifest));
      setDeliverySecrets(createDeliverySecretState(undefined, manifest));
      return;
    }

    if (!form.appCode.trim()) {
      return;
    }

    clearDeliveryMutation.mutate(form.appCode.trim());
  };

  const pageTitle = form.name.trim() || (isCreateMode ? '新建应用' : (app?.name ?? '应用详情'));
  const isWaitingForCreateInit = isCreateMode && !initialized;
  const isWaitingForEditInit =
    !isCreateMode && !!app && (!initialized || !deliverySettingsQuery.isFetched);

  if ((!isCreateMode && isAppsLoading) || isWaitingForCreateInit || isWaitingForEditInit) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (!isCreateMode && !isAppsLoading && !app) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-sm text-muted-foreground">未找到应用 {appCode}</p>
        <Link to="/admin/apps">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回应用列表
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AppEditTabKey)}
        className="min-h-screen"
      >
        <AppEditHeader
          title={pageTitle}
          appCode={form.appCode}
          isCreateMode={isCreateMode}
          visibleTabKeys={visibleTabKeys}
          formStatus={form.status}
          hasUnsavedChanges={hasUnsavedChanges}
          activeTab={activeTab}
          offersCount={editableOffers.length}
          plansCount={editablePlans.length}
          featuresCount={editableFeatures.length}
          isSaving={isBusy}
          saveDisabled={isBusy}
          onSave={saveDraft}
        />

        <div className="mx-auto max-w-5xl p-6">
          <AppEditBasicsTab
            form={form}
            setField={setField}
            isCreateMode={isCreateMode}
            isSaving={isBusy}
            saveDisabled={isBusy}
            onSave={saveDraft}
          />
          <AppEditContentTab
            form={form}
            setField={setField}
            isSaving={isBusy}
            saveDisabled={isBusy}
            onSave={saveDraft}
          />
          {showDeliveryTab ? (
            <AppEditDeliveryTab
              appCode={form.appCode}
              isCreateMode={isCreateMode}
              manifest={manifest}
              deliverySettings={deliverySettings}
              deliverySecrets={deliverySecrets}
              manifestSource={manifestSource}
              updateValueField={setDeliveryField}
              updateSecretField={setDeliverySecretField}
              updateManifestField={setManifestField}
              hasSyncedManifest={hasSyncedManifest}
              isSyncingManifest={syncManifestMutation.isPending}
              onSyncManifest={handleSyncManifest}
              onClear={handleClearDelivery}
              clearDisabled={isBusy}
              isSaving={isBusy}
              saveDisabled={isBusy}
              onSave={saveDraft}
            />
          ) : null}
          <AppEditFeaturesTab
            features={editableFeatures}
            updateFeature={updateFeature}
            addFeature={addFeature}
            removeFeature={removeFeature}
            isSaving={isBusy}
            saveDisabled={isBusy}
            onSave={saveDraft}
          />
          <AppEditPlansTab
            features={editableFeatures}
            plans={editablePlans}
            manifest={manifest}
            updatePlan={updatePlan}
            addPlan={addPlan}
            removePlan={removePlan}
            isSaving={isBusy}
            saveDisabled={isBusy}
            onSave={saveDraft}
          />
          <AppEditOffersTab
            availablePlans={availablePlans}
            availablePlanMap={availablePlanMap}
            allPlans={availablePlans}
            editableOffers={editableOffers}
            updateOffer={updateOffer}
            addOffer={addOffer}
            removeOffer={removeOffer}
            markDefaultOffer={markDefaultOffer}
            isSaving={isBusy}
            saveDisabled={isBusy}
            onSave={saveDraft}
          />
        </div>
      </Tabs>

      <ConfirmActionDialog
        open={isDialogOpen}
        onOpenChange={() => undefined}
        onCancel={stayOnPage}
        title="离开当前编辑页？"
        description="你有未保存的修改。离开后，这些改动会丢失。"
        confirmText="离开并丢弃"
        confirmVariant="destructive"
        onConfirm={confirmNavigation}
      />
    </>
  );
}
