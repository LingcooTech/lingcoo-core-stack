import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { App, Button, Form, Modal, Space, Tabs } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { UpsertAppInputSchema } from '@lingcoo/contracts/models';
import { listAppsAdmin, listCatalogSnapshot, syncAppDeliveryManifest, upsertApp } from '@/api/apps';
import { clearDeliverySettings, getDeliverySettings, upsertDeliverySettings } from '@/api/delivery';
import { PageContainer, FormActions } from '@/components/admin/PageContainer';
import { AsyncState } from '@/components/admin/AsyncState';
import { AppReadiness } from '@/components/apps/app-edit/AppReadiness';
import {
  AppBasicsSection,
  AppFeaturesSection,
  AppPlansSection,
  AppOffersSection,
} from '@/components/admin/apps/AppCatalogSections';
import { AppDeliverySection } from '@/components/admin/apps/AppDeliverySection';
import {
  EMPTY_FORM_STATE,
  APP_EDIT_TABS,
  buildSaveRequest,
  createEditableFeatures,
  createEditableOffers,
  createEditablePlans,
  createFormState,
  validateDraft,
  type FormState,
  type EditableFeature,
  type EditablePlan,
  type EditableOffer,
} from '@/components/apps/app-edit/model';
import {
  buildDeliveryManifestSourcePayload,
  buildDeliverySettingsPayload,
  createDeliveryManifestSourceDraft,
  createDeliverySecretState,
  createDeliverySettingsDraft,
  getDeliveryManifest,
  serializeDeliveryManifestSourceDraft,
  type DeliverySettingsDraft,
  type DeliveryManifestSourceDraft,
} from '@/lib/app-delivery';
import { useSettingsForm } from '@/lib/settings-form';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';
const AppContentSection = lazy(() =>
  import('@/components/admin/apps/AppContentSection').then((module) => ({
    default: module.AppContentSection,
  })),
);
export interface AppEditorDraft {
  app: FormState;
  features: EditableFeature[];
  plans: EditablePlan[];
  offers: EditableOffer[];
  delivery: DeliverySettingsDraft;
  source: DeliveryManifestSourceDraft;
}
export function AppEditPage() {
  const { appCode } = useParams();
  return <AppEditor key={appCode ?? 'new'} appCode={appCode} />;
}
function AppEditor({ appCode }: { appCode?: string }) {
  const qc = useQueryClient(),
    navigate = useNavigate(),
    { message } = App.useApp(),
    [modal, context] = Modal.useModal(),
    { user } = useAuth();
  const writable = hasPermission(normalizeRole(user?.role), 'apps.manage');
  const [active, setActive] = useState('basics');
  const apps = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin }),
    catalog = useQuery({ queryKey: ['catalog'], queryFn: listCatalogSnapshot }),
    delivery = useQuery({
      queryKey: ['delivery-settings', appCode],
      queryFn: () => getDeliverySettings(appCode!),
      enabled: Boolean(appCode),
    });
  const app = apps.data?.items.find((a) => a.code === appCode),
    manifest = getDeliveryManifest(app);
  const initial = useMemo<AppEditorDraft | undefined>(() => {
    if (!appCode)
      return {
        app: structuredClone(EMPTY_FORM_STATE),
        features: [],
        plans: [],
        offers: [],
        delivery: createDeliverySettingsDraft(undefined, null),
        source: createDeliveryManifestSourceDraft(),
      };
    if (!app || !catalog.data || !delivery.data) return undefined;
    return {
      app: createFormState(app),
      features: createEditableFeatures(app),
      plans: createEditablePlans(app, catalog.data.planFeatures),
      offers: createEditableOffers(app),
      delivery: createDeliverySettingsDraft(delivery.data, getDeliveryManifest(app)),
      source: createDeliveryManifestSourceDraft(app),
    };
  }, [appCode, app, catalog.data, delivery.data]);
  const { form, dirty, reset, rebase } = useSettingsForm(initial);
  const mode = Form.useWatch(['app', 'deliveryMode'], form);
  const secrets = createDeliverySecretState(delivery.data, manifest);
  const codes = useRef<{ features: Map<string, string>; plans: Map<string, string> } | null>(null);
  const reconcile = () => {
    const d = form.getFieldsValue(true) as AppEditorDraft;
    const previous =
      codes.current ??
      (initial
        ? {
            features: new Map(initial.features.map((f) => [f.id, f.code])),
            plans: new Map(initial.plans.map((p) => [p.id, p.code])),
          }
        : null);
    if (previous) {
      const fs = new Map(d.features.map((f) => [f.id, f.code])),
        ps = new Map(d.plans.map((p) => [p.id, p.code]));
      const rename = (code: string, before: Map<string, string>, after: Map<string, string>) => {
        const entry = [...before].find(([, v]) => v === code);
        return entry ? after.get(entry[0]) : code;
      };
      d.plans = d.plans.map((p) => ({
        ...p,
        featureCodes: p.featureCodes
          .map((c) => rename(c, previous.features, fs))
          .filter((v): v is string => Boolean(v)),
      }));
      d.offers = d.offers
        .map((o) => ({ ...o, planCode: rename(o.planCode, previous.plans, ps) ?? '' }))
        .filter((o) => (ps.size === 0 ? false : Boolean(o.planCode)));
      if (d.offers.length && d.offers.filter((o) => o.isDefault).length !== 1)
        d.offers = d.offers.map((o, i) => ({ ...o, isDefault: i === 0 }));
      form.setFieldsValue({ plans: d.plans, offers: d.offers });
    }
    codes.current = {
      features: new Map(d.features.map((f) => [f.id, f.code])),
      plans: new Map(d.plans.map((p) => [p.id, p.code])),
    };
  };
  const mutation = useMutation({
    mutationFn: async () => {
      await form.validateFields();
      const d = form.getFieldsValue(true) as AppEditorDraft;
      const issue = validateDraft(d.app, d.features, d.plans, d.offers);
      if (issue) {
        setActive(issue.tab);
        throw new Error(issue.message);
      }
      const request = buildSaveRequest(d.app, d.features, d.plans, d.offers, app?.meta);
      if (!appCode && apps.data?.items.some((a) => a.code === request.appCode))
        throw new Error('App Code 已存在');
      const source = buildDeliveryManifestSourcePayload(d.source);
      if (Object.keys(source).length)
        request.payload.meta = { ...request.payload.meta, deliveryManifestSource: source };
      else if (request.payload.meta) delete request.payload.meta.deliveryManifestSource;
      request.payload = UpsertAppInputSchema.parse(request.payload);
      const saved = await upsertApp(request.appCode, request.payload);
      qc.setQueryData(
        ['apps'],
        (current: Awaited<ReturnType<typeof listAppsAdmin>> | undefined) => ({
          items: [saved, ...(current?.items ?? []).filter((a) => a.id !== saved.id)],
        }),
      );
      const overview =
        d.app.deliveryMode === 'one_click'
          ? await upsertDeliverySettings(saved.code, buildDeliverySettingsPayload(d.delivery))
          : undefined;
      return { saved, overview, d };
    },
    onSuccess: ({ saved, overview, d }) => {
      const next = {
        ...d,
        app: createFormState(saved),
        features: createEditableFeatures(saved),
        plans: d.plans,
        offers: createEditableOffers(saved),
        source: createDeliveryManifestSourceDraft(saved),
        delivery: overview
          ? createDeliverySettingsDraft(overview, getDeliveryManifest(saved))
          : d.delivery,
      };
      flushSync(() => {
        reset(next);
        codes.current = null;
      });
      if (overview) qc.setQueryData(['delivery-settings', saved.code], overview);
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      void qc.invalidateQueries({ queryKey: ['app-readiness'] });
      void message.success('应用配置已保存');
      if (!appCode) void navigate(`/admin/apps/${saved.code}/edit`, { replace: true });
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  const sync = useMutation({
    mutationFn: async () => {
      if (!appCode) throw new Error('请先创建应用');
      if (
        serializeDeliveryManifestSourceDraft(form.getFieldValue('source')) !==
        serializeDeliveryManifestSourceDraft(createDeliveryManifestSourceDraft(app))
      )
        throw new Error('请先保存交付清单来源，再同步清单');
      const saved = await syncAppDeliveryManifest(
        appCode,
        buildDeliveryManifestSourcePayload(form.getFieldValue('source')),
      );
      const overview = await getDeliverySettings(appCode);
      return { saved, overview };
    },
    onSuccess: ({ saved, overview }) => {
      qc.setQueryData(
        ['apps'],
        (current: Awaited<ReturnType<typeof listAppsAdmin>> | undefined) => ({
          items: [saved, ...(current?.items ?? []).filter((a) => a.id !== saved.id)],
        }),
      );
      qc.setQueryData(['delivery-settings', appCode], overview);
      rebase({
        delivery: createDeliverySettingsDraft(overview, getDeliveryManifest(saved)),
        source: createDeliveryManifestSourceDraft(saved),
      });
      void qc.invalidateQueries({ queryKey: ['app-readiness'] });
      void message.success('Manifest 已同步，其他未保存字段已保留');
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  const clear = () => {
    modal.confirm({
      title: '清空平台交付配置？',
      content: '已保存的交付密钥和预设将被清除；应用其他编辑内容会保留。',
      okText: '清空配置',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (appCode) await clearDeliverySettings(appCode);
        const overview = appCode ? await getDeliverySettings(appCode) : undefined;
        if (overview) qc.setQueryData(['delivery-settings', appCode], overview);
        rebase({ delivery: createDeliverySettingsDraft(overview, manifest) });
        void qc.invalidateQueries({ queryKey: ['app-readiness'] });
        void message.success('交付配置已清空');
      },
    });
  };
  const error = apps.error || catalog.error || delivery.error;
  const loading =
    !initial &&
    !error &&
    Boolean(appCode) &&
    (!apps.isFetched || !catalog.isFetched || !delivery.isFetched);
  return (
    <PageContainer
      title={appCode ? '编辑应用' : '新建应用'}
      backTo="/admin/apps"
      actions={
        <Space>
          {appCode && (
            <Button href={`/apps/${appCode}`} target="_blank">
              预览应用
            </Button>
          )}
        </Space>
      }
    >
      {context}
      <AsyncState
        loading={loading}
        error={error}
        empty={Boolean(appCode) && !loading && !error && !app}
        emptyText="应用不存在"
        onRetry={() => {
          void apps.refetch();
          void catalog.refetch();
          void delivery.refetch();
        }}
      >
        <Form
          name="app-editor"
          form={form}
          layout="vertical"
          disabled={!writable || mutation.isPending || sync.isPending}
          onValuesChange={reconcile}
          onFinish={() => mutation.mutate()}
        >
          <Tabs
            tabBarExtraContent={
              <AppReadiness appCode={appCode} dirty={dirty} onNavigate={setActive} />
            }
            activeKey={active}
            onChange={setActive}
            items={APP_EDIT_TABS.filter((t) => t.key !== 'delivery' || mode === 'one_click').map(
              (t) => ({
                key: t.key,
                label: t.label,
                forceRender: t.key !== 'content',
                children:
                  t.key === 'basics' ? (
                    <AppBasicsSection create={!appCode} />
                  ) : t.key === 'content' ? (
                    <Suspense fallback={<AsyncState loading>{null}</AsyncState>}>
                      <AppContentSection />
                    </Suspense>
                  ) : t.key === 'features' ? (
                    <AppFeaturesSection />
                  ) : t.key === 'plans' ? (
                    <AppPlansSection form={form} manifest={manifest} />
                  ) : t.key === 'offers' ? (
                    <AppOffersSection form={form} />
                  ) : (
                    <AppDeliverySection
                      manifest={manifest}
                      secrets={secrets}
                      create={!appCode}
                      savedSource={createDeliveryManifestSourceDraft(app)}
                      busy={sync.isPending}
                      onSync={() => sync.mutate()}
                      onClear={clear}
                    />
                  ),
              }),
            )}
          />
          <FormActions hint={dirty ? '有未保存的修改' : '配置已保存'}>
            <Button
              type="primary"
              htmlType="submit"
              loading={mutation.isPending}
              disabled={!writable || !dirty}
            >
              保存应用配置
            </Button>
          </FormActions>
        </Form>
      </AsyncState>
    </PageContainer>
  );
}
