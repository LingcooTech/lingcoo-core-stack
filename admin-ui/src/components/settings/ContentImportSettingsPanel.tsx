import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Form, Input, Modal, Tag } from 'antd';
import {
  clearContentImportSettings,
  getContentImportSettings,
  testNotionImportSettings,
  testWordPressImportSettings,
  upsertContentImportSettings,
} from '@/api/settings';
import { AsyncState } from '@/components/admin/AsyncState';
import { FormActions } from '@/components/admin/PageContainer';
import { parseSettingsForm, useSettingsForm } from '@/lib/settings-form';
import {
  buildContentImportPayload,
  contentImportSchema,
  type ContentImportValues,
} from '@/lib/settings-schemas';
export function ContentImportSettingsPanel() {
  const qc = useQueryClient(),
    { message } = App.useApp(),
    [modal, context] = Modal.useModal();
  const query = useQuery({
    queryKey: ['system-settings', 'content-import'],
    queryFn: getContentImportSettings,
  });
  const values = query.data
    ? {
        wordpressSiteUrl: query.data.values.wordpress.siteUrl,
        wordpressUsername: query.data.values.wordpress.username,
        wordpressAppPassword: '',
        notionApiToken: '',
      }
    : undefined;
  const { form, dirty, reset } = useSettingsForm<ContentImportValues>(values);
  const getPayload = () =>
    buildContentImportPayload(
      parseSettingsForm(contentImportSchema, form.getFieldsValue(true), form),
      {
        includeWordPressPassword: Boolean(form.getFieldValue('wordpressAppPassword')),
        includeNotionToken: Boolean(form.getFieldValue('notionApiToken')),
      },
    );
  const refresh = async () => {
    const result = await getContentImportSettings();
    reset({
      wordpressSiteUrl: result.values.wordpress.siteUrl,
      wordpressUsername: result.values.wordpress.username,
      wordpressAppPassword: '',
      notionApiToken: '',
    });
    qc.setQueryData(['system-settings', 'content-import'], result);
  };
  const save = useMutation({
    mutationFn: () => upsertContentImportSettings(getPayload()),
    onSuccess: async () => {
      await refresh();
      void message.success('内容导入配置已保存');
    },
    onError: (error) => {
      void message.error(error.message);
    },
  });
  const clear = useMutation({
    mutationFn: clearContentImportSettings,
    onSuccess: async () => {
      await refresh();
      wordpress.reset();
      notion.reset();
      void message.success('数据库中的内容导入配置已清空');
    },
    onError: (error) => {
      void message.error(error.message);
    },
  });
  const wordpress = useMutation({
    mutationFn: () => testWordPressImportSettings(getPayload().wordpress),
    onSuccess: () => {
      void message.success('WordPress 连接成功');
    },
    onError: (error) => {
      void message.error(error.message);
    },
  });
  const notion = useMutation({
    mutationFn: () => testNotionImportSettings(getPayload().notion),
    onSuccess: () => {
      void message.success('Notion 连接成功');
    },
    onError: (error) => {
      void message.error(error.message);
    },
  });
  const pending = save.isPending || clear.isPending || wordpress.isPending || notion.isPending;
  return (
    <AsyncState loading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
      {context}
      <Form
        name="content-import"
        form={form}
        layout="vertical"
        disabled={pending}
        onFinish={() => save.mutate()}
      >
        <div className="admin-form-grid">
          <Card title="WordPress">
            <Form.Item
              name="wordpressSiteUrl"
              label="站点 URL"
              extra="用于按文章 URL 导入 WordPress 文章。"
            >
              <Input type="url" placeholder="https://your-site.com" />
            </Form.Item>
            <Form.Item name="wordpressUsername" label="用户名">
              <Input placeholder="可选，用于受保护 REST API" />
            </Form.Item>
            <Form.Item
              name="wordpressAppPassword"
              label="应用密码"
              extra="留空保留已保存的应用密码。"
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Button loading={wordpress.isPending} onClick={() => wordpress.mutate()}>
              测试 WordPress 连接
            </Button>
            {wordpress.data && (
              <Tag color="success">
                {wordpress.data.mode === 'authenticated'
                  ? `已认证: ${wordpress.data.account ?? '当前账户'}`
                  : '公开访问可用'}
              </Tag>
            )}
          </Card>
          <Card title="Notion">
            <Form.Item
              name="notionApiToken"
              label="API Token"
              extra="用于按页面 URL 导入 Notion 页面；留空保留原值。"
            >
              <Input.Password autoComplete="new-password" placeholder="secret_xxx / ntn_xxx" />
            </Form.Item>
            <Button loading={notion.isPending} onClick={() => notion.mutate()}>
              测试 Notion 连接
            </Button>
            {notion.data && (
              <Tag color="success">
                {notion.data.workspace || notion.data.userName || '连接成功'}
              </Tag>
            )}
          </Card>
        </div>
        <FormActions hint={dirty ? '有未保存的修改' : '敏感配置加密保存，永不回显'}>
          <Button
            type="primary"
            htmlType="submit"
            loading={save.isPending}
            disabled={!dirty || pending}
          >
            保存内容导入配置
          </Button>
          <Button
            danger
            disabled={pending}
            onClick={() => {
              modal.confirm({
                title: '清空内容导入配置',
                content:
                  '这会删除数据库中的 WordPress / Notion 导入连接配置。之后内容管理页将无法直接导入对应内容，直到重新配置。',
                okText: '确认清空',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: () => clear.mutateAsync(),
              });
            }}
          >
            清空配置
          </Button>
        </FormActions>
      </Form>
    </AsyncState>
  );
}
