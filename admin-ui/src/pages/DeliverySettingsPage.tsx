import { useMemo } from 'react';
import { App, Alert, Button, Form, Modal } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { listAppsAdmin } from '@/api/apps';
import { getDeliverySettings, upsertDeliverySettings, clearDeliverySettings } from '@/api/delivery';
import { AppDeliverySection } from '@/components/admin/apps/AppDeliverySection';
import { PageContainer, FormActions } from '@/components/admin/PageContainer';
import { AsyncState } from '@/components/admin/AsyncState';
import { useSettingsForm } from '@/lib/settings-form';
import {
  buildDeliverySettingsPayload,
  createDeliverySettingsDraft,
  createDeliverySecretState,
  createDeliveryManifestSourceDraft,
  getDeliveryManifest,
} from '@/lib/app-delivery';
export function DeliverySettingsPage() {
  const { appCode } = useParams(),
    qc = useQueryClient(),
    { message } = App.useApp(),
    [modal, context] = Modal.useModal();
  const apps = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const app = apps.data?.items.find((a) => a.code === appCode),
    manifest = getDeliveryManifest(app);
  const settings = useQuery({
    queryKey: ['delivery-settings', appCode],
    queryFn: () => getDeliverySettings(appCode!),
    enabled: !!app,
  });
  const initial = useMemo(
    () =>
      settings.data
        ? {
            delivery: createDeliverySettingsDraft(settings.data, manifest),
            source: createDeliveryManifestSourceDraft(app),
          }
        : undefined,
    [settings.data, app, manifest],
  );
  const { form, dirty, reset } = useSettingsForm(initial);
  const mutation = useMutation({
    mutationFn: async () => {
      await form.validateFields();
      return upsertDeliverySettings(
        appCode!,
        buildDeliverySettingsPayload(form.getFieldValue('delivery')),
      );
    },
    onSuccess: (overview) => {
      qc.setQueryData(['delivery-settings', appCode], overview);
      reset({
        delivery: createDeliverySettingsDraft(overview, manifest),
        source: createDeliveryManifestSourceDraft(app),
      });
      void qc.invalidateQueries({ queryKey: ['app-readiness'] });
      void message.success('平台交付预设已保存');
    },
    onError: (e) => void message.error(e.message),
  });
  const clear = () =>
    modal.confirm({
      title: '清空平台交付预设？',
      content: '将清除平台预设和交付凭据，已有实例不受影响。',
      okText: '清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await clearDeliverySettings(appCode!);
        await settings.refetch();
        void qc.invalidateQueries({ queryKey: ['app-readiness'] });
      },
    });
  return (
    <PageContainer
      title="平台交付预设"
      backTo={`/admin/apps/${appCode}/edit`}
      backLabel="返回商品"
      navigation={<Button href={`/admin/development/projects/${appCode}`}>开发项目</Button>}
    >
      {context}
      <AsyncState
        loading={apps.isPending || (!!app && settings.isPending)}
        error={apps.error || settings.error}
        onRetry={() => {
          void apps.refetch();
          void settings.refetch();
        }}
      >
        {!app ? (
          <Alert type="info" title="先从开发项目创建商品草稿，再配置交付预设。" />
        ) : (
          <Form
            form={form}
            layout="vertical"
            disabled={mutation.isPending}
            onFinish={() => mutation.mutate()}
          >
            <AppDeliverySection
              showSource={false}
              manifest={manifest}
              secrets={createDeliverySecretState(settings.data, manifest)}
              create={false}
              savedSource={createDeliveryManifestSourceDraft(app)}
              busy={mutation.isPending}
              onSync={() => {}}
              onClear={() => {
                clear();
              }}
            />
            <FormActions hint={dirty ? '有未保存的修改' : '配置已保存'}>
              <Button
                type="primary"
                htmlType="submit"
                disabled={!dirty || !manifest}
                loading={mutation.isPending}
              >
                保存平台预设
              </Button>
            </FormActions>
          </Form>
        )}
      </AsyncState>
    </PageContainer>
  );
}
