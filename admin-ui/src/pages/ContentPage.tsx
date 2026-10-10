import { useDeferredValue, useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Select, Space, Table } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import {
  importNotionContent,
  importWechatContent,
  importWordPressContent,
  listContent,
} from '@/api/admin';
import type { AdminContentListParams } from '@/api/admin';
import type { ContentItem } from '@/api/types';
import { PageContainer } from '@/components/admin/PageContainer';
import { AsyncState } from '@/components/admin/AsyncState';
import { StatusTag } from '@/components/admin/StatusTag';
import { useTableState } from '@/hooks/useTableState';
import { parseSettingsForm } from '@/lib/settings-form';
import { formatTime } from '@/lib/utils';
const statuses = [
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
];
const sources = [
  { value: 'manual', label: '手动' },
  { value: 'wordpress', label: 'WordPress' },
  { value: 'notion', label: 'Notion' },
  { value: 'wechat', label: '微信公众号' },
];
const importSchema = z.object({
  source: z.enum(['wordpress', 'notion', 'wechat']),
  url: z.url(),
  status: z.enum(['draft', 'published']),
});
export function ContentPage() {
  const qc = useQueryClient(),
    { message } = App.useApp();
  const { page, search, filters, setPage, setSearch, setFilter, clearFilters } = useTableState({
    defaultPageSize: 20,
    knownFilters: ['sourceType', 'status'],
  });
  const deferred = useDeferredValue(search);
  const params: AdminContentListParams = {
    limit: 20,
    offset: (page - 1) * 20,
    search: deferred.trim() || undefined,
    sourceType: filters.sourceType?.[0] as AdminContentListParams['sourceType'],
    status: filters.status?.[0] as AdminContentListParams['status'],
  };
  const query = useQuery({
    queryKey: ['admin-content', params],
    queryFn: () => listContent(params),
  });
  const [open, setOpen] = useState(false),
    [form] = Form.useForm<z.infer<typeof importSchema>>();
  const mutation = useMutation({
    mutationFn: async () => {
      const v = parseSettingsForm(importSchema, await form.validateFields(), form);
      return v.source === 'wordpress'
        ? importWordPressContent({ postUrl: v.url, status: v.status })
        : v.source === 'notion'
          ? importNotionContent({ pageUrl: v.url, status: v.status })
          : importWechatContent({ url: v.url, status: v.status });
    },
    onSuccess: (item) => {
      void message.success(`已导入：${item.title}`);
      setOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['admin-content'] });
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  return (
    <PageContainer
      title="内容管理"
      width="wide"
      description="创建本地内容，或通过已配置的 WordPress、Notion 和微信公众号导入内容。"
      filters={
        <>
          <Input.Search
            aria-label="搜索内容"
            placeholder="搜索标题、slug、作者、来源链接"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 300 }}
          />
          <Select
            aria-label="来源"
            placeholder="全部来源"
            allowClear
            value={filters.sourceType?.[0]}
            options={sources}
            onChange={(v) => setFilter('sourceType', v ? [v] : [])}
            style={{ width: 160 }}
          />
          <Select
            aria-label="状态"
            placeholder="全部状态"
            allowClear
            value={filters.status?.[0]}
            options={statuses}
            onChange={(v) => setFilter('status', v ? [v] : [])}
            style={{ width: 140 }}
          />
          <Button onClick={clearFilters}>重置</Button>
        </>
      }
      actions={
        <Space>
          <Button onClick={() => setOpen(true)}>导入内容</Button>
          <Button type="primary">
            <Link to="/admin/content/new">新建内容</Link>
          </Button>
        </Space>
      }
    >
      <AsyncState error={query.error} onRetry={() => void query.refetch()}>
        <Card>
          <Table<ContentItem>
            rowKey="id"
            loading={query.isPending}
            dataSource={query.data?.items ?? []}
            scroll={{ x: 1000 }}
            pagination={{
              current: page,
              pageSize: 20,
              total: query.data?.total ?? 0,
              showSizeChanger: false,
              onChange: setPage,
              showTotal: (t) => `共 ${t} 篇内容`,
            }}
            columns={[
              {
                title: '内容',
                dataIndex: 'title',
                width: 360,
                render: (_, r) => (
                  <Space orientation="vertical" size={0}>
                    <Link to={`/admin/content/${r.id}/edit`}>{r.title}</Link>
                    <small>{r.slug}</small>
                    <span>{r.excerpt}</span>
                  </Space>
                ),
              },
              {
                title: '来源',
                dataIndex: 'sourceType',
                render: (v: string) => sources.find((s) => s.value === v)?.label ?? v,
              },
              { title: '作者', dataIndex: 'authorName' },
              {
                title: '状态',
                dataIndex: 'status',
                render: (v: string) => (
                  <StatusTag
                    label={statuses.find((s) => s.value === v)?.label ?? v}
                    tone={v === 'published' ? 'ok' : v === 'draft' ? 'warn' : 'neutral'}
                  />
                ),
              },
              { title: '发布时间', dataIndex: 'publishedAt', render: (v: string) => formatTime(v) },
              { title: '导入时间', render: (_, r) => formatTime(r.importedAt || r.createdAt) },
              {
                title: '操作',
                render: (_, r) => (
                  <Space>
                    <Link to={`/admin/content/${r.id}/edit`}>编辑</Link>
                    {r.sourceUrl && (
                      <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">
                        原文
                      </a>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </AsyncState>
      <Modal
        title="导入外部内容"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => mutation.mutate()}
        confirmLoading={mutation.isPending}
        okText="导入"
        cancelText="取消"
        maskClosable={false}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ source: 'wordpress', url: '', status: 'draft' }}
          disabled={mutation.isPending}
        >
          <Form.Item name="source" label="来源" rules={[{ required: true }]}>
            <Select options={sources.filter((s) => s.value !== 'manual')} />
          </Form.Item>
          <Form.Item name="url" label="文章或页面 URL" rules={[{ required: true, type: 'url' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="status" label="导入状态">
            <Select options={statuses.slice(0, 2)} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
