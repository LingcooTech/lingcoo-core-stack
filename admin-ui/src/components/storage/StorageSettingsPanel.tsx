import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Collapse, Form, Input } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  storageSettingsSchema,
  type StorageSettingsOverview,
  type StorageSettings,
} from '@lingcoo/contracts';
import { getStorageSettings, saveStorageSettings, testStorageSettings } from '@/api/storage';
import { STORAGE_FIELDS } from '@/components/settings/integration-definitions';
import { RotateSecretsButton } from '@/components/settings/RotateSecretsButton';
import { IntegrationFields, IntegrationHeader } from '@/components/settings/IntegrationFields';
import { AsyncState } from '@/components/admin/AsyncState';
import { FormActions } from '@/components/admin/PageContainer';
import { parseSettingsForm, useSettingsForm } from '@/lib/settings-form';
export function StorageSettingsPanel() {
  const query = useQuery({ queryKey: ['storage-settings'], queryFn: getStorageSettings });
  return (
    <AsyncState loading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
      {query.data && <SettingsForm overview={query.data} />}
    </AsyncState>
  );
}
function SettingsForm({ overview }: { overview: StorageSettingsOverview }) {
  const navigate = useNavigate();
  const qc = useQueryClient(),
    { message } = App.useApp();
  const values: StorageSettings = {
    ...overview.values,
    provider: overview.values.provider ?? 's3',
    accessKey: '',
    secretKey: '',
  };
  const { form, dirty, reset } = useSettingsForm(values);
  const provider = Form.useWatch('provider', form);
  const mutation = useMutation({
    mutationFn: async (action: 'save' | 'test') => {
      const input = parseSettingsForm(storageSettingsSchema, await form.validateFields(), form);
      return action === 'save' ? saveStorageSettings(input) : testStorageSettings(input);
    },
    onSuccess: async (_, action) => {
      void message.success(
        action === 'save' ? '文件存储配置已保存' : '存储连接成功；请再上传一个小文件验证读写权限',
      );
      if (action === 'save') {
        const saved = await getStorageSettings();
        reset({
          ...saved.values,
          provider: saved.values.provider ?? 's3',
          accessKey: '',
          secretKey: '',
        });
        qc.setQueryData(['storage-settings'], saved);
      }
    },
    onError: (error) => {
      void message.error(error.message);
    },
  });
  const count = STORAGE_FIELDS.filter((field) =>
    field.control === 'secret'
      ? overview.secrets[field.key as 'accessKey' | 'secretKey'].configured
      : typeof overview.values[field.key as keyof typeof overview.values] === 'boolean' ||
        Boolean(overview.values[field.key as keyof typeof overview.values]),
  ).length;
  return (
    <Card>
      <IntegrationHeader
        title="文件存储"
        description="营销素材文件存储；七牛云 Kodo 通过 S3-compatible 参数接入。"
        count={count}
      >
        <RotateSecretsButton disabled={dirty || mutation.isPending} />
      </IntegrationHeader>
      {overview.source === 'legacy' && (
        <Alert
          type="warning"
          showIcon
          title="原七牛配置待补充 S3 区域与服务地址，请核实后测试连接。"
          style={{ marginBottom: 24 }}
        />
      )}
      <Form
        name="storage"
        form={form}
        layout="vertical"
        disabled={mutation.isPending}
        onFinish={() => mutation.mutate('save')}
      >
        <IntegrationFields
          prefix="storage"
          fields={STORAGE_FIELDS}
          source={overview.source}
          secrets={{
            accessKey: overview.secrets.accessKey.configured,
            secretKey: overview.secrets.secretKey.configured,
          }}
        />
        <Alert
          type="info"
          showIcon
          title={
            provider === 'local'
              ? '本地磁盘使用 API 与 Worker 共享的持久化目录，S3 参数保留但不参与本地读写；请将该目录纳入备份。'
              : '私有素材必须使用私有空间；平台可见性不会改变存储服务的直链或 CDN 访问权限。上传目录只影响新文件。'
          }
        />
        <Collapse
          style={{ marginTop: 24 }}
          items={[
            {
              key: 'cdn',
              label: '兼容设置 · 公开文件 CDN 地址（可选）',
              forceRender: true,
              children: (
                <Form.Item
                  name="publicBaseUrl"
                  label="公开文件 CDN 地址（可选）"
                  extra="保留既有配置。填写前须确认域名能读取公开素材；本地驱动不使用此地址。"
                >
                  <Input type="url" placeholder="留空时由应用受控地址提供文件" />
                </Form.Item>
              ),
            },
          ]}
        />
        <FormActions hint={dirty ? '有未保存的修改' : '敏感项留空保留原值'}>
          <Button
            type="primary"
            htmlType="submit"
            disabled={!dirty}
            loading={mutation.isPending && mutation.variables === 'save'}
          >
            保存配置
          </Button>
          <Button onClick={() => mutation.mutate('test')}>测试存储连接</Button>
          <Button onClick={() => void navigate('/admin/storage')}>管理素材</Button>
        </FormActions>
      </Form>
    </Card>
  );
}
