import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  Collapse,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Tabs,
  Tree,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { listAppsAdmin } from '@/api/apps';
import {
  createDocPage,
  createDocSpace,
  getDocSpace,
  listDocSpaces,
  updateDocPage,
  updateDocSpace,
} from '@/api/admin';
import type { AdminDocSpaceDetail, DocPage, DocPageTreeNode } from '@/api/types';
import { PageContainer, FormActions } from '@/components/admin/PageContainer';
import { AsyncState } from '@/components/admin/AsyncState';
import { AssetImageField } from '@/components/storage/AssetImageField';
import { parseSettingsForm, useSettingsForm } from '@/lib/settings-form';
const spaceSchema = z.object({
  slug: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string(),
  iconUrl: z.string(),
  editBaseUrl: z.union([z.url(), z.literal('')]),
  type: z.enum(['product', 'app', 'internal']),
  appId: z.string(),
  sortOrder: z.number().int(),
  status: z.enum(['active', 'hidden', 'archived']),
});
const pageSchema = z.object({
  title: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  summary: z.string(),
  content: z.string(),
  parentId: z.string(),
  sortOrder: z.number().int(),
  status: z.enum(['draft', 'published', 'archived']),
  publishedAt: z.string().refine((v) => !v || Number.isFinite(new Date(v).getTime()), '日期无效'),
});
const emptySpace: z.infer<typeof spaceSchema> = {
  slug: '',
  title: '',
  description: '',
  iconUrl: '',
  editBaseUrl: '',
  type: 'product',
  appId: '',
  sortOrder: 0,
  status: 'active',
};
const emptyPage: z.infer<typeof pageSchema> = {
  title: '',
  slug: '',
  summary: '',
  content: '',
  parentId: '',
  sortOrder: 0,
  status: 'draft',
  publishedAt: '',
};
function localDate(v: string | null) {
  if (!v) return '';
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function treeData(
  nodes: DocPageTreeNode[],
): { key: string; title: string; children: ReturnType<typeof treeData> }[] {
  return nodes.map((n) => ({ key: n.id, title: n.title, children: treeData(n.children) }));
}
export function DocsPage() {
  const list = useQuery({ queryKey: ['admin-doc-spaces'], queryFn: () => listDocSpaces() });
  const [spaceId, setSpaceId] = useState<string | null | undefined>(undefined),
    [pageId, setPageId] = useState<string | null>(null),
    [drafts, setDrafts] = useState<Record<string, boolean>>({});
  const [editorRevision, setEditorRevision] = useState(0);
  const [modal, context] = Modal.useModal();
  const onPageDirty = useCallback(
    (dirty: boolean) => setDrafts((d) => (d.page === dirty ? d : { ...d, page: dirty })),
    [],
  );
  const onSpaceDirty = useCallback(
    (dirty: boolean) => setDrafts((d) => (d.space === dirty ? d : { ...d, space: dirty })),
    [],
  );
  const selected = spaceId === undefined ? (list.data?.items[0]?.id ?? null) : spaceId;
  const detail = useQuery({
    queryKey: ['admin-doc-space', selected],
    queryFn: () => getDocSpace(selected!),
    enabled: Boolean(selected),
  });
  const move = (next: () => void) => {
    if (Object.values(drafts).some(Boolean)) {
      modal.confirm({
        title: '放弃当前文档的未保存修改？',
        okText: '放弃并切换',
        cancelText: '继续编辑',
        onOk: () => {
          setDrafts({});
          setEditorRevision((r) => r + 1);
          next();
        },
      });
    } else next();
  };
  return (
    <PageContainer title="文档管理">
      {context}
      <AsyncState loading={list.isPending} error={list.error} onRetry={() => void list.refetch()}>
        <div className="admin-asset-layout">
          <Card
            title="文档空间"
            extra={
              <Button
                type="primary"
                size="small"
                onClick={() =>
                  move(() => {
                    setSpaceId(null);
                    setPageId(null);
                  })
                }
              >
                新建空间
              </Button>
            }
          >
            <Select
              aria-label="选择文档空间"
              value={selected}
              placeholder="选择文档空间"
              style={{ width: '100%' }}
              options={list.data?.items.map((s) => ({
                value: s.id,
                label: `${s.title} (${s.pageCount})`,
              }))}
              onChange={(id) =>
                move(() => {
                  setSpaceId(id);
                  setPageId(null);
                })
              }
            />
            <Button
              block
              disabled={!selected}
              style={{ margin: '16px 0' }}
              onClick={() => move(() => setPageId(null))}
            >
              新建页面
            </Button>
            <Tree
              treeData={treeData(detail.data?.tree ?? [])}
              selectedKeys={pageId ? [pageId] : []}
              onSelect={(keys) => {
                if (keys[0]) move(() => setPageId(String(keys[0])));
              }}
            />
          </Card>
          <AsyncState
            loading={Boolean(selected) && detail.isPending}
            error={detail.error}
            onRetry={() => void detail.refetch()}
          >
            <Tabs
              defaultActiveKey={selected ? 'page' : 'space'}
              key={`${selected ?? 'new'}:${editorRevision}`}
              items={[
                {
                  key: 'page',
                  label: '文档页面',
                  children: selected ? (
                    <DocPageForm
                      key={pageId ?? 'new'}
                      spaceId={selected}
                      page={detail.data?.pages.find((p) => p.id === pageId)}
                      pages={detail.data?.pages ?? []}
                      onSaved={setPageId}
                      onDirty={onPageDirty}
                    />
                  ) : (
                    <p>请先创建文档空间。</p>
                  ),
                  forceRender: true,
                },
                {
                  key: 'space',
                  label: '空间设置',
                  forceRender: true,
                  children: (
                    <DocSpaceForm
                      space={detail.data?.space}
                      onSaved={(id) => {
                        setSpaceId(id);
                        void detail.refetch();
                      }}
                      onDirty={onSpaceDirty}
                    />
                  ),
                },
              ]}
            />
          </AsyncState>
        </div>
      </AsyncState>
    </PageContainer>
  );
}
function DocSpaceForm({
  space,
  onSaved,
  onDirty,
}: {
  space?: AdminDocSpaceDetail['space'];
  onSaved: (id: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const qc = useQueryClient(),
    { message } = App.useApp();
  const apps = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const values = space
    ? {
        slug: space.slug,
        title: space.title,
        description: space.description ?? '',
        iconUrl: space.iconUrl ?? '',
        editBaseUrl: typeof space.meta?.editBaseUrl === 'string' ? space.meta.editBaseUrl : '',
        type: space.type,
        appId: space.appId ?? '',
        sortOrder: space.sortOrder,
        status: space.status,
      }
    : emptySpace;
  const { form, dirty, reset } = useSettingsForm(values);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const mutation = useMutation({
    mutationFn: async () => {
      const v = parseSettingsForm(spaceSchema, await form.validateFields(), form),
        meta = { ...space?.meta };
      if (v.editBaseUrl) meta.editBaseUrl = v.editBaseUrl;
      else delete meta.editBaseUrl;
      const { editBaseUrl: _omit, ...data } = v;
      const payload = { ...data, appId: v.appId || undefined, meta };
      return space ? updateDocSpace(space.id, payload) : createDocSpace(payload);
    },
    onSuccess: (s) => {
      reset(form.getFieldsValue(true));
      void qc.invalidateQueries({ queryKey: ['admin-doc-spaces'] });
      void qc.invalidateQueries({ queryKey: ['admin-doc-space', s.id] });
      onSaved(s.id);
      void message.success('文档空间已保存');
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  return (
    <Card title={space ? '编辑文档空间' : '新建文档空间'}>
      <Form
        name="doc-space"
        form={form}
        layout="vertical"
        disabled={mutation.isPending}
        onFinish={() => mutation.mutate()}
      >
        <div className="admin-form-grid">
          {[
            ['slug', 'Slug'],
            ['title', '标题'],
            ['description', '描述'],
            ['editBaseUrl', '编辑源地址'],
          ].map(([k = '', l = '']) => (
            <Form.Item
              key={k}
              name={k}
              label={l}
              rules={['slug', 'title'].includes(k) ? [{ required: true }] : []}
            >
              <Input />
            </Form.Item>
          ))}
          <Form.Item name="type" label="空间类型">
            <Select
              options={[
                { value: 'product', label: '产品' },
                { value: 'app', label: '应用' },
                { value: 'internal', label: '内部' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="appId"
            normalize={(value: string | undefined) => value ?? ''}
            label="关联应用"
          >
            <Select
              allowClear
              loading={apps.isPending}
              options={apps.data?.items.map((a) => ({ value: a.id, label: a.name }))}
            />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序">
            <InputNumber precision={0} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: 'active', label: '启用' },
                { value: 'hidden', label: '隐藏' },
                { value: 'archived', label: '归档' },
              ]}
            />
          </Form.Item>
        </div>
        <AsyncState error={apps.error} onRetry={() => void apps.refetch()}>
          <></>
        </AsyncState>
        <Form.Item name="iconUrl" label="图标">
          <AssetImageField defaultPrefix="docs/icon" previewAlt="文档空间图标" />
        </Form.Item>
        <FormActions hint={dirty ? '有未保存的修改' : '已保存'}>
          <Button type="primary" htmlType="submit" loading={mutation.isPending} disabled={!dirty}>
            保存空间
          </Button>
          {space && (
            <Button href={`/docs/${space.slug}`} target="_blank">
              预览空间
            </Button>
          )}
        </FormActions>
      </Form>
    </Card>
  );
}
function DocPageForm({
  spaceId,
  page,
  pages,
  onSaved,
  onDirty,
}: {
  spaceId: string;
  page?: DocPage;
  pages: DocPage[];
  onSaved: (id: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const qc = useQueryClient(),
    { message } = App.useApp();
  const values = page
    ? {
        title: page.title,
        slug: page.slug,
        summary: page.summary ?? '',
        content: page.content,
        parentId: page.parentId ?? '',
        sortOrder: page.sortOrder,
        status: page.status,
        publishedAt: localDate(page.publishedAt),
      }
    : emptyPage;
  const { form, dirty, reset } = useSettingsForm(values);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const excluded = new Set(page ? [page.id] : []);
  let count = -1;
  while (count !== excluded.size) {
    count = excluded.size;
    for (const p of pages) if (p.parentId && excluded.has(p.parentId)) excluded.add(p.id);
  }
  const mutation = useMutation({
    mutationFn: async () => {
      const v = parseSettingsForm(pageSchema, await form.validateFields(), form);
      const payload = {
        ...v,
        spaceId,
        parentId: v.parentId || undefined,
        publishedAt: v.publishedAt ? new Date(v.publishedAt).toISOString() : undefined,
      };
      return page ? updateDocPage(page.id, payload) : createDocPage(payload);
    },
    onSuccess: (s) => {
      reset(form.getFieldsValue(true));
      qc.setQueryData(['admin-doc-space', spaceId], (current: AdminDocSpaceDetail | undefined) =>
        current
          ? { ...current, pages: [s, ...current.pages.filter((p) => p.id !== s.id)] }
          : current,
      );
      void qc.invalidateQueries({ queryKey: ['admin-doc-space', spaceId] });
      onSaved(s.id);
      void message.success('文档页面已保存');
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  return (
    <Card title={page ? '编辑文档页面' : '新建文档页面'}>
      <Form
        name="doc-page"
        form={form}
        layout="vertical"
        disabled={mutation.isPending}
        onFinish={() => mutation.mutate()}
      >
        <div className="admin-form-grid">
          <Form.Item name="title" label="标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="slug" label="Slug" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="parentId" label="父级页面">
            <Select
              options={[
                { value: '', label: '顶级页面' },
                ...pages
                  .filter((p) => !excluded.has(p.id))
                  .map((p) => ({ value: p.id, label: p.title })),
              ]}
            />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序">
            <InputNumber precision={0} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: 'draft', label: '草稿' },
                { value: 'published', label: '已发布' },
                { value: 'archived', label: '归档' },
              ]}
            />
          </Form.Item>
          <Form.Item name="publishedAt" label="发布时间">
            <Input type="datetime-local" />
          </Form.Item>
        </div>
        <Form.Item name="summary" label="摘要">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Collapse
          items={[
            {
              key: 'help',
              label: '编辑说明',
              children: '正文支持 Markdown / HTML。父级页面不可选择自身或子级页面。',
            },
          ]}
        />
        <Form.Item name="content" label="正文">
          <Input.TextArea rows={22} className="font-mono" />
        </Form.Item>
        <FormActions hint={dirty ? '有未保存的修改' : '已保存'}>
          <Button type="primary" htmlType="submit" loading={mutation.isPending} disabled={!dirty}>
            保存页面
          </Button>
        </FormActions>
      </Form>
    </Card>
  );
}
