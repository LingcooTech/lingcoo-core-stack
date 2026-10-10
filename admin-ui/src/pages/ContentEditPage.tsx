import { App, Button, Card, Form, Input, Select } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { z } from 'zod';
import { createContent, getContent, updateContent } from '@/api/admin';
import { PageContainer, FormActions } from '@/components/admin/PageContainer';
import { AsyncState } from '@/components/admin/AsyncState';
import { AssetImageField } from '@/components/storage/AssetImageField';
import { parseSettingsForm, useSettingsForm } from '@/lib/settings-form';
const schema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(160),
  excerpt: z.string(),
  content: z.string(),
  coverUrl: z.string(),
  authorName: z.string(),
  status: z.enum(['draft', 'published', 'archived']),
  sourceType: z.enum(['manual', 'wordpress', 'notion', 'wechat']),
  sourceId: z.string(),
  sourceUrl: z.string(),
});
type Values = z.infer<typeof schema>;
const empty: Values = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  coverUrl: '',
  authorName: '',
  status: 'draft',
  sourceType: 'manual',
  sourceId: '',
  sourceUrl: '',
};
export function ContentEditPage() {
  const { contentId } = useParams(),
    navigate = useNavigate(),
    qc = useQueryClient(),
    { message } = App.useApp();
  const query = useQuery({
    queryKey: ['admin-content-item', contentId],
    queryFn: () => getContent(contentId!),
    enabled: Boolean(contentId),
  });
  const item = query.data;
  const values: Values | undefined = contentId
    ? item
      ? {
          title: item.title,
          slug: item.slug,
          excerpt: item.excerpt ?? '',
          content: item.content,
          coverUrl: item.coverUrl ?? '',
          authorName: item.authorName ?? '',
          status: item.status,
          sourceType: item.sourceType,
          sourceId: item.sourceId ?? '',
          sourceUrl: item.sourceUrl ?? '',
        }
      : undefined
    : empty;
  const { form, dirty, reset } = useSettingsForm(values);
  const mutation = useMutation({
    mutationFn: async () => {
      const v = parseSettingsForm(schema, await form.validateFields(), form);
      return contentId ? updateContent(contentId, v) : createContent(v);
    },
    onSuccess: (saved) => {
      flushSync(() =>
        reset({
          ...form.getFieldsValue(true),
          ...saved,
          excerpt: saved.excerpt ?? '',
          coverUrl: saved.coverUrl ?? '',
          authorName: saved.authorName ?? '',
          sourceId: saved.sourceId ?? '',
          sourceUrl: saved.sourceUrl ?? '',
        }),
      );
      qc.setQueryData(['admin-content-item', saved.id], saved);
      void qc.invalidateQueries({ queryKey: ['admin-content'] });
      void message.success('内容已保存');
      if (!contentId) void navigate(`/admin/content/${saved.id}/edit`, { replace: true });
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  return (
    <PageContainer title={contentId ? '编辑内容' : '新建内容'} backTo="/admin/content">
      <AsyncState
        loading={Boolean(contentId) && query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Form
          name="content-editor"
          form={form}
          layout="vertical"
          disabled={mutation.isPending}
          onFinish={() => mutation.mutate()}
        >
          <Card title="基本信息">
            <div className="admin-form-grid">
              {[
                ['title', '标题'],
                ['slug', 'Slug'],
                ['authorName', '作者'],
                ['sourceId', '来源 ID'],
                ['sourceUrl', '来源链接'],
              ].map(([key = '', label = '']) => (
                <Form.Item
                  key={key}
                  name={key}
                  label={label}
                  rules={key === 'title' ? [{ required: true }] : []}
                >
                  <Input />
                </Form.Item>
              ))}
              <Form.Item name="status" label="状态">
                <Select
                  options={[
                    { value: 'draft', label: '草稿' },
                    { value: 'published', label: '已发布' },
                    { value: 'archived', label: '已归档' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="sourceType" label="来源类型">
                <Select
                  options={[
                    { value: 'manual', label: '手动' },
                    { value: 'wordpress', label: 'WordPress' },
                    { value: 'notion', label: 'Notion' },
                    { value: 'wechat', label: '微信公众号' },
                  ]}
                />
              </Form.Item>
            </div>
            <Form.Item name="coverUrl" label="封面图">
              <AssetImageField defaultPrefix="content/cover" previewAlt="内容封面" />
            </Form.Item>
            <Form.Item name="excerpt" label="摘要">
              <Input.TextArea rows={4} />
            </Form.Item>
          </Card>
          <Card title="正文内容" extra="Markdown / HTML">
            <Form.Item name="content">
              <Input.TextArea aria-label="正文内容" rows={22} className="font-mono" />
            </Form.Item>
          </Card>
          <FormActions hint={dirty ? '有未保存的修改' : '已保存'}>
            <Button type="primary" htmlType="submit" loading={mutation.isPending} disabled={!dirty}>
              保存内容
            </Button>
          </FormActions>
        </Form>
      </AsyncState>
    </PageContainer>
  );
}
