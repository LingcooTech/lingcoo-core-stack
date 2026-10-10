import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Form, Input, Modal } from 'antd';
import {
  clearPublicPagesSettings,
  getPublicPagesSettings,
  upsertPublicPagesSettings,
} from '@/api/settings';
import { AsyncState } from '@/components/admin/AsyncState';
import { FormActions } from '@/components/admin/PageContainer';
import { parseSettingsForm, useSettingsForm } from '@/lib/settings-form';
import { publicPagesSchema, type PublicPagesValues } from '@/lib/settings-schemas';
export function PublicPagesSettingsPanel() {
  const qc = useQueryClient(),
    { message } = App.useApp(),
    [modal, context] = Modal.useModal();
  const query = useQuery({
    queryKey: ['system-settings', 'public-pages'],
    queryFn: getPublicPagesSettings,
  });
  const { form, dirty, reset } = useSettingsForm<PublicPagesValues>(query.data?.values);
  const save = useMutation({
    mutationFn: upsertPublicPagesSettings,
    onSuccess: async (result) => {
      reset(result.values);
      qc.setQueryData(['system-settings', 'public-pages'], result);
      await qc.invalidateQueries({ queryKey: ['public-site-settings'] });
      void message.success('公共页面文案已保存');
    },
    onError: (error) => {
      void message.error(error.message);
    },
  });
  const clear = useMutation({
    mutationFn: clearPublicPagesSettings,
    onSuccess: async () => {
      const saved = await getPublicPagesSettings();
      reset(saved.values);
      qc.setQueryData(['system-settings', 'public-pages'], saved);
      await qc.invalidateQueries({ queryKey: ['public-site-settings'] });
      void message.success('公共页面文案已重置为默认值');
    },
    onError: (error) => {
      void message.error(error.message);
    },
  });
  return (
    <AsyncState loading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
      {context}
      <Form
        name="public-pages"
        form={form}
        layout="vertical"
        disabled={save.isPending || clear.isPending}
        onFinish={(values) => {
          try {
            save.mutate(parseSettingsForm(publicPagesSchema, values, form));
          } catch {
            /* Form displays errors. */
          }
        }}
      >
        {(['contentHub', 'docsHub'] as const).map((key) => (
          <Card
            key={key}
            title={key === 'contentHub' ? '内容中心' : '文档中心'}
            style={{ marginBottom: 24 }}
          >
            <div className="admin-form-grid">
              <Form.Item name={[key, 'eyebrow']} label="引导文字">
                <Input maxLength={60} />
              </Form.Item>
              <Form.Item name={[key, 'title']} label="页面标题">
                <Input maxLength={120} />
              </Form.Item>
            </div>
            <Form.Item name={[key, 'description']} label="页面说明">
              <Input.TextArea rows={3} maxLength={500} showCount />
            </Form.Item>
          </Card>
        ))}
        <FormActions hint={dirty ? '有未保存的修改' : '管理公开内容中心与文档中心文案'}>
          <Button
            type="primary"
            htmlType="submit"
            loading={save.isPending}
            disabled={!dirty || clear.isPending}
          >
            保存公共页面文案
          </Button>
          <Button
            danger
            disabled={save.isPending || clear.isPending}
            onClick={() => {
              modal.confirm({
                title: '重置公共页面文案？',
                content: '这会清空数据库中的内容中心 / 文档中心 Hub 文案配置，并恢复系统默认文案。',
                okText: '确认重置',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: () => clear.mutateAsync(),
              });
            }}
          >
            重置文案
          </Button>
        </FormActions>
      </Form>
    </AsyncState>
  );
}
