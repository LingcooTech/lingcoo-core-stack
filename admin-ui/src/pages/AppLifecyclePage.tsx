import { useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  Space,
  Table,
  Tag,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  getApplicationLifecycle,
  publishApplicationRelease,
  registerApplicationRelease,
  withdrawApplicationRelease,
} from '@/api/app-lifecycle';
import { AppConnections } from '@/components/admin/apps/AppConnections';
import { AppSourceBuilds } from '@/components/admin/apps/AppSourceBuilds';
import { AppImageBrowser } from '@/components/admin/apps/AppImageBrowser';
import { AppComposePlan } from '@/components/admin/apps/AppComposePlan';
import { PageContainer } from '@/components/admin/PageContainer';
import { AsyncState } from '@/components/admin/AsyncState';

export function AppLifecyclePage() {
  const code = useParams().appCode!,
    qc = useQueryClient(),
    { message, modal } = App.useApp();
  const [open, setOpen] = useState(false),
    [detailsId, setDetailsId] = useState<string | null>(null),
    [form] = Form.useForm();
  const query = useQuery({
    queryKey: ['app-lifecycle', code],
    queryFn: () => getApplicationLifecycle(code),
  });
  const change = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'withdraw' }) =>
      action === 'publish'
        ? publishApplicationRelease(code, id)
        : withdrawApplicationRelease(code, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['app-lifecycle', code] });
      void message.success('版本状态已更新');
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const values = await form.validateFields();
      let images: unknown;
      try {
        images = JSON.parse(values.images);
      } catch {
        throw new Error('镜像映射必须是 JSON 对象');
      }
      return registerApplicationRelease(code, {
        version: values.version,
        commit: values.commit,
        images,
        definition: query.data!.definition,
        notes: values.notes ?? '',
        ...(values.buildUrl ? { buildUrl: values.buildUrl } : {}),
      });
    },
    onSuccess: () => {
      setOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['app-lifecycle', code] });
      void message.success('交付版本已登记为草稿');
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  const data = query.data;
  return (
    <PageContainer
      title="应用生命周期"
      backTo="/admin/apps"
      actions={
        <Space>
          <Button>
            <Link to={`/admin/apps/${code}/edit`}>销售与展示配置</Link>
          </Button>
          <AppConnections />
        </Space>
      }
    >
      <AsyncState
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <AppSourceBuilds code={code} />
        <Card title="源码与交付定义">
          <Descriptions
            column={{ xs: 1, md: 2 }}
            items={[
              { key: 'code', label: 'App Code', children: code },
              {
                key: 'name',
                label: '应用',
                children: data?.definition?.app.name ?? '尚未导入新版应用定义',
              },
              {
                key: 'repo',
                label: '仓库',
                children: data?.source ? (
                  <a href={data.source.repository} target="_blank" rel="noreferrer">
                    {data.source.repository}
                  </a>
                ) : (
                  '文件导入 / 尚未关联'
                ),
              },
              { key: 'ref', label: '分支 / 标签', children: data?.source?.ref ?? '—' },
              { key: 'commit', label: '导入提交', children: data?.source?.commit ?? '—' },
              { key: 'path', label: '定义路径', children: data?.source?.path ?? '—' },
            ]}
          />
          {data?.definition?.images.length ? (
            <Table
              rowKey="key"
              pagination={false}
              dataSource={data.definition.images}
              columns={[
                { title: '组件', dataIndex: 'key' },
                { title: '镜像仓库', dataIndex: 'repository' },
                { title: '镜像变量', dataIndex: 'imageEnv' },
                {
                  title: '操作',
                  render: (_, row) => (
                    <AppImageBrowser code={code} imageKey={row.key} repository={row.repository} />
                  ),
                },
              ]}
            />
          ) : null}
        </Card>
        <Card
          title="交付版本"
          extra={
            <Button
              type="primary"
              disabled={!data?.definition}
              onClick={() => {
                form.setFieldsValue({
                  commit: data?.source?.commit,
                  images: JSON.stringify(
                    Object.fromEntries(
                      data?.definition?.images.map((v) => [v.key, `${v.repository}@sha256:`]) ?? [],
                    ),
                    null,
                    2,
                  ),
                });
                setOpen(true);
              }}
            >
              登记版本
            </Button>
          }
        >
          <Table
            rowKey="id"
            dataSource={data?.releases}
            scroll={{ x: 850 }}
            columns={[
              { title: '版本', dataIndex: 'version' },
              { title: '源码提交', dataIndex: 'commit', render: (v: string) => v.slice(0, 12) },
              {
                title: '状态',
                dataIndex: 'status',
                render: (v: string) => (
                  <Tag color={v === 'published' ? 'success' : 'default'}>
                    {{ draft: '草稿', published: '已发布', withdrawn: '已撤回' }[v]}
                  </Tag>
                ),
              },
              { title: '镜像', render: (_, row) => Object.keys(row.images).join('、') || '免部署' },
              {
                title: '构建',
                render: (_, row) =>
                  row.buildUrl ? (
                    <a href={row.buildUrl} target="_blank" rel="noreferrer">
                      查看构建
                    </a>
                  ) : (
                    '—'
                  ),
              },
              {
                title: '操作',
                render: (_, row) => (
                  <Space>
                    {row.definition.delivery.kind === 'compose' && (
                      <AppComposePlan
                        code={code}
                        releaseId={row.id}
                        modes={row.definition.delivery.modes}
                      />
                    )}
                    <Button type="link" onClick={() => setDetailsId(row.id)}>
                      详情
                    </Button>
                    {row.status === 'draft' && (
                      <Button
                        type="link"
                        loading={change.isPending}
                        onClick={() => {
                          modal.confirm({
                            title: `发布 ${row.version}？`,
                            content: '发布不自动上架商品或升级已有实例。',
                            okText: '发布',
                            cancelText: '取消',
                            onOk: () => change.mutateAsync({ id: row.id, action: 'publish' }),
                          });
                        }}
                      >
                        发布
                      </Button>
                    )}
                    {row.status !== 'withdrawn' && (
                      <Button
                        type="link"
                        danger
                        loading={change.isPending}
                        onClick={() => {
                          modal.confirm({
                            title: `撤回 ${row.version}？`,
                            content: '版本快照会保留。',
                            okText: '撤回',
                            cancelText: '取消',
                            onOk: () => change.mutateAsync({ id: row.id, action: 'withdraw' }),
                          });
                        }}
                      >
                        撤回
                      </Button>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </AsyncState>
      <Drawer
        title="版本快照"
        size="large"
        open={Boolean(detailsId)}
        onClose={() => setDetailsId(null)}
        destroyOnHidden
      >
        {(() => {
          const release = data?.releases.find((v) => v.id === detailsId);
          if (!release) return null;
          return (
            <Space orientation="vertical" size="large" style={{ width: '100%' }}>
              <Descriptions
                column={1}
                items={[
                  { key: 'version', label: '版本', children: release.version },
                  { key: 'commit', label: '源码提交', children: release.commit },
                  { key: 'digest', label: '定义摘要', children: release.definitionDigest },
                  { key: 'license', label: '软件许可证', children: release.definition.app.license },
                  {
                    key: 'delivery',
                    label: '交付类型',
                    children: release.definition.delivery.kind,
                  },
                  { key: 'notes', label: '版本说明', children: release.notes || '—' },
                ]}
              />
              <Table
                rowKey="key"
                pagination={false}
                dataSource={Object.entries(release.images).map(([key, image]) => ({ key, image }))}
                columns={[
                  { title: '组件', dataIndex: 'key' },
                  {
                    title: '不可变镜像',
                    dataIndex: 'image',
                    render: (v: string) => <span style={{ wordBreak: 'break-all' }}>{v}</span>,
                  },
                ]}
              />
              <Card title="交付定义">
                <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}>
                  {JSON.stringify(release.definition, null, 2)}
                </pre>
              </Card>
            </Space>
          );
        })()}
      </Drawer>
      <Drawer
        title="登记交付版本"
        open={open}
        onClose={() => setOpen(false)}
        size="large"
        destroyOnHidden
      >
        <Alert
          title="版本绑定当前交付定义快照；相同版本号不能替换内容。"
          type="info"
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical" onFinish={() => save.mutate()}>
          <Form.Item name="version" label="版本号" rules={[{ required: true }]}>
            <Input placeholder="1.0.0" />
          </Form.Item>
          <Form.Item
            name="commit"
            label="源码提交 SHA"
            rules={[
              { required: true },
              { pattern: /^[a-f0-9]{40}$/, message: '填写完整的 40 位提交 SHA' },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="images" label="组件镜像映射（JSON）" rules={[{ required: true }]}>
            <Input.TextArea rows={7} spellCheck={false} />
          </Form.Item>
          <Form.Item name="buildUrl" label="GitHub Actions 构建链接">
            <Input />
          </Form.Item>
          <Form.Item name="notes" label="版本说明">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={save.isPending}>
              保存版本草稿
            </Button>
            <Button onClick={() => setOpen(false)}>取消</Button>
          </Space>
        </Form>
      </Drawer>
    </PageContainer>
  );
}
