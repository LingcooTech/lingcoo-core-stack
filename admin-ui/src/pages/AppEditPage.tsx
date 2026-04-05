import { ArrowLeft } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { listAppsAdmin, listCatalogSnapshot, upsertApp } from '@/api/apps';
import { AppEditBasicsTab } from '@/components/apps/app-edit/AppEditBasicsTab';
import { AppEditContentTab } from '@/components/apps/app-edit/AppEditContentTab';
import { AppEditDeliveryTab } from '@/components/apps/app-edit/AppEditDeliveryTab';
import { AppEditHeader } from '@/components/apps/app-edit/AppEditHeader';
import { AppEditOffersTab } from '@/components/apps/app-edit/AppEditOffersTab';
import { AppEditPlansTab } from '@/components/apps/app-edit/AppEditPlansTab';
import {
  EMPTY_FORM_STATE,
  buildSaveRequest,
  createEditableOffers,
  createFormState,
  createOfferId,
  formatPriceYuan,
  serializeDraft,
  slugify,
  type AppEditTabKey,
  type EditableOffer,
  type FormState,
  type SaveRequest,
} from '@/components/apps/app-edit/model';
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { useUnsavedChangesPrompt } from '@/hooks/useUnsavedChangesPrompt';

export function AppEditPage() {
  const { appCode } = useParams<{ appCode: string }>();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<AppEditTabKey>('basics');
  const [form, setForm] = useState<FormState>(EMPTY_FORM_STATE);
  const [editableOffers, setEditableOffers] = useState<EditableOffer[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState('');

  const { data: appsData, isLoading: isAppsLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: listAppsAdmin,
  });

  const { data: catalogData } = useQuery({
    queryKey: ['catalog'],
    queryFn: listCatalogSnapshot,
  });

  const app = useMemo(
    () => (appsData?.items ?? []).find((item) => item.code === appCode) ?? null,
    [appsData, appCode],
  );

  const allPlans = useMemo(() => catalogData?.plans ?? [], [catalogData?.plans]);

  useEffect(() => {
    setActiveTab('basics');
    setForm(EMPTY_FORM_STATE);
    setEditableOffers([]);
    setInitialized(false);
    setSavedSnapshot('');
  }, [appCode]);

  useEffect(() => {
    if (!app || initialized) {
      return;
    }
    const nextForm = createFormState(app);
    const nextOffers = createEditableOffers(app);
    setForm(nextForm);
    setEditableOffers(nextOffers);
    setSavedSnapshot(serializeDraft(nextForm, nextOffers));
    setInitialized(true);
  }, [app, initialized]);

  const availablePlans = useMemo(
    () =>
      allPlans
        .filter((plan) => app && plan.appId === app.id)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [allPlans, app],
  );

  const availablePlanMap = useMemo(
    () => new Map(availablePlans.map((plan) => [plan.code, plan])),
    [availablePlans],
  );

  const currentSnapshot = useMemo(
    () => serializeDraft(form, editableOffers),
    [form, editableOffers],
  );
  const hasUnsavedChanges = initialized && currentSnapshot !== savedSnapshot;
  const { isDialogOpen, confirmNavigation, stayOnPage } = useUnsavedChangesPrompt(hasUnsavedChanges);

  const currentFeatures = app?.features ?? [];
  const currentPlans = app?.plans ?? [];
  const deliveryEligible = app?.type === 'service' || app?.type === 'web_app';

  const upsertMutation = useMutation({
    mutationFn: (request: SaveRequest) => {
      if (!appCode) {
        throw new Error('缺少 appCode');
      }
      return upsertApp(appCode, request.payload);
    },
    onSuccess: (_result, request) => {
      setSavedSnapshot(request.snapshot);
      toast.success('应用配置已保存');
      void qc.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '保存失败');
    },
  });

  const saveDraft = () => {
    if (!app || !form.name.trim()) {
      return;
    }
    upsertMutation.mutate(buildSaveRequest(form, editableOffers, app.meta));
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateOffer = (offerId: string, updater: (offer: EditableOffer) => EditableOffer) => {
    setEditableOffers((prev) => prev.map((offer) => (offer.id === offerId ? updater(offer) : offer)));
  };

  const addOffer = () => {
    const seed = availablePlans[0];
    setEditableOffers((prev) => {
      const next = [
        ...prev,
        {
          id: createOfferId(),
          code: slugify(seed?.code || `offer_${Date.now().toString(36)}`),
          planCode: seed?.code || '',
          title: seed?.name || '',
          description: '',
          badge: '',
          priceYuan: formatPriceYuan(seed?.priceAmount),
          currency: seed?.currency || 'CNY',
          status: seed?.status || 'active',
          isDefault: false,
        },
      ];
      if (next.length === 1) {
        next[0] = { ...next[0], isDefault: true };
      }
      return next;
    });
  };

  const removeOffer = (offerId: string) => {
    setEditableOffers((prev) => {
      const next = prev.filter((offer) => offer.id !== offerId);
      if (next.length > 0 && !next.some((offer) => offer.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      return next;
    });
  };

  const markDefaultOffer = (offerId: string) => {
    setEditableOffers((prev) =>
      prev.map((offer) => ({ ...offer, isDefault: offer.id === offerId })),
    );
  };

  if (isAppsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (!app) {
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
          app={app}
          formStatus={form.status}
          hasUnsavedChanges={hasUnsavedChanges}
          activeTab={activeTab}
          offersCount={editableOffers.length}
          plansCount={currentPlans.length}
          featuresCount={currentFeatures.length}
          isSaving={upsertMutation.isPending}
          saveDisabled={upsertMutation.isPending || !form.name.trim()}
          onSave={saveDraft}
        />

        <div className="mx-auto max-w-5xl p-6">
          <AppEditBasicsTab
            form={form}
            setField={setField}
            isSaving={upsertMutation.isPending}
            saveDisabled={upsertMutation.isPending || !form.name.trim()}
            onSave={saveDraft}
          />
          <AppEditContentTab
            form={form}
            setField={setField}
            isSaving={upsertMutation.isPending}
            saveDisabled={upsertMutation.isPending || !form.name.trim()}
            onSave={saveDraft}
          />
          <AppEditPlansTab features={currentFeatures} plans={currentPlans} />
          <AppEditOffersTab
            availablePlans={availablePlans}
            availablePlanMap={availablePlanMap}
            allPlans={allPlans}
            editableOffers={editableOffers}
            updateOffer={updateOffer}
            addOffer={addOffer}
            removeOffer={removeOffer}
            markDefaultOffer={markDefaultOffer}
            isSaving={upsertMutation.isPending}
            saveDisabled={upsertMutation.isPending || !form.name.trim()}
            onSave={saveDraft}
          />
          <AppEditDeliveryTab deliveryEligible={deliveryEligible} formType={form.type} />
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
