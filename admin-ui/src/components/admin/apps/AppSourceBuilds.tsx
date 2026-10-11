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
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getApplicationLifecycle,
  listAppConnections,
  previewApplication,
  type ApplicationPreview,
} from '@/api/app-lifecycle';
import {
  applyApplicationSource,
  listApplicationBuilds,
  triggerApplicationBuild,
  listPublishingTokens,
  issuePublishingToken,
  revokePublishingToken,
} from '@/api/app-publishing';
import { AsyncState } from '@/components/admin/AsyncState';

export function AppSourceBuilds({ code }: { code: string }) {
  const qc = useQueryClient(),
    { message } = App.useApp(),
    [sourceOpen, setSourceOpen] = useState(false),
    [buildOpen, setBuildOpen] = useState(false),
    [tokensOpen, setTokensOpen] = useState(false),
    [candidate, setCandidate] = useState<ApplicationPreview | null>(null),
    [requestId, setRequestId] = useState(''),
    [form] = Form.useForm(),
    [buildForm] = Form.useForm();
  const source = useQuery({
    queryKey: ['app-lifecycle', code],
    queryFn: () => getApplicationLifecycle(code),
  });
  const connections = useQuery({
    queryKey: ['app-connections'],
    queryFn: listAppConnections,
    enabled: sourceOpen,
  });
  const builds = useQuery({
    queryKey: ['app-builds', code],
    queryFn: () => listApplicationBuilds(code),
    enabled: Boolean(source.data),
    refetchInterval: source.data?.definition?.build ? 30000 : false,
  });
  const read = useMutation({
    mutationFn: async () => {
      const v = await form.validateFields();
      const preview = await previewApplication({
        source: {
          repository: v.repository,
          ref: v.ref,
          path: v.path,
          ...(v.connectionId ? { connectionId: v.connectionId } : {}),
        },
      });
      if (preview.definition.app.code !== code) throw new Error('仓库 App Code 与当前应用不一致');
      return preview;
    },
    onSuccess: setCandidate,
    onError: (e) => {
      void message.error(e.message);
    },
  });
  const save = useMutation({
    mutationFn: () => applyApplicationSource(code, candidate!),
    onSuccess: () => {
      setSourceOpen(false);
      setCandidate(null);
      void qc.invalidateQueries({ queryKey: ['app-lifecycle', code] });
      void qc.invalidateQueries({ queryKey: ['app-builds', code] });
      void message.success('交付定义已保存；已有版本与运行实例未变更');
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  const trigger = useMutation({
    mutationFn: async () => {
      const v = await buildForm.validateFields();
      return triggerApplicationBuild(code, { requestId, version: v.version });
    },
    onSuccess: (result) => {
      setBuildOpen(false);
      void qc.invalidateQueries({ queryKey: ['app-builds', code] });
      if (result.status === 'dispatched') void message.success('构建请求已提交');
      else if (result.status === 'failed')
        void message.error('该请求提交失败；修复配置后新建构建请求');
      else void message.info('该请求结果尚未确认，请核对 Actions 运行记录');
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: ['app-builds', code] });
      void message.error(e.message);
    },
  });
  return (
    <>
      <Card
        title="源码与构建"
        extra={
          <Space>
            <Button
              onClick={() => {
                form.setFieldsValue({
                  repository: source.data?.source?.repository,
                  ref: source.data?.source?.ref ?? 'main',
                  path: source.data?.source?.path ?? 'stack/app.yaml',
                  connectionId: source.data?.source?.connectionId,
                });
                setCandidate(null);
                setSourceOpen(true);
              }}
            >
              {source.data?.source ? '同步交付定义' : '关联仓库定义'}
            </Button>
            <Button onClick={() => setTokensOpen(true)}>CI 发布凭证</Button>
            <Button
              type="primary"
              disabled={!source.data?.source || !source.data?.definition?.build}
              onClick={() => {
                setRequestId(crypto.randomUUID());
                buildForm.resetFields();
                setBuildOpen(true);
              }}
            >
              构建新版本
            </Button>
          </Space>
        }
      >
        <Descriptions
          column={2}
          items={[
            {
              key: 'workflow',
              label: '构建流程',
              children: source.data?.definition?.build?.workflow ?? '未声明',
            },
            {
              key: 'commit',
              label: '构建基准提交',
              children: source.data?.source?.commit ?? '未关联',
            },
          ]}
        />
        <AsyncState error={builds.error} onRetry={() => void builds.refetch()}>
          <Table
            rowKey="id"
            size="small"
            loading={builds.isPending && builds.fetchStatus === 'fetching'}
            dataSource={builds.data?.runs}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: '构建', dataIndex: 'title' },
              { title: '提交', dataIndex: 'commit', render: (v: string) => v.slice(0, 12) },
              {
                title: '状态',
                render: (_, row) => (
                  <Tag
                    color={
                      row.conclusion === 'success'
                        ? 'success'
                        : row.conclusion === 'failure'
                          ? 'error'
                          : 'default'
                    }
                  >
                    {row.conclusion ?? row.status}
                  </Tag>
                ),
              },
              {
                title: '开始时间',
                dataIndex: 'createdAt',
                render: (v: string) => new Date(v).toLocaleString(),
              },
              {
                title: '操作',
                render: (_, row) => (
                  <a href={row.url} target="_blank" rel="noreferrer">
                    日志
                  </a>
                ),
              },
            ]}
          />
        </AsyncState>
        {Boolean(builds.data?.requests.length) && (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={builds.data?.requests}
            columns={[
              { title: '请求版本', dataIndex: 'version' },
              {
                title: '状态',
                dataIndex: 'status',
                render: (v: string) =>
                  ({
                    dispatching: '提交中，需核对',
                    dispatched: '已提交',
                    unknown: '结果未知，需核对',
                    failed: '提交失败',
                  })[v],
              },
              { title: '请求 ID', dataIndex: 'id' },
              {
                title: '对应构建',
                render: (_, row) => {
                  const run = builds.data?.runs.find((v) => v.title.includes(row.id));
                  return run ? (
                    <a href={run.url} target="_blank" rel="noreferrer">
                      查看构建
                    </a>
                  ) : (
                    '等待 Actions 运行记录'
                  );
                },
              },
            ]}
          />
        )}
      </Card>
      <Drawer
        title="读取仓库交付定义"
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
        size="large"
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onValuesChange={() => setCandidate(null)}
          onFinish={() => read.mutate()}
        >
          <Form.Item name="repository" label="GitHub 仓库" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="connectionId" label="访问连接">
            <Select
              allowClear
              placeholder="公开仓库 / 匿名读取"
              options={connections.data?.items
                .filter((v) => v.kind === 'github')
                .map((v) => ({ label: v.name, value: v.id }))}
            />
          </Form.Item>
          <Form.Item name="ref" label="分支 / 标签" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="path" label="应用定义路径" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={read.isPending}>
            读取并预览
          </Button>
        </Form>
        {candidate && (
          <>
            <Descriptions
              style={{ marginTop: 24 }}
              column={1}
              items={[
                { key: 'commit', label: '新提交', children: candidate.source?.commit },
                { key: 'name', label: '应用', children: candidate.definition.app.name },
                {
                  key: 'delivery',
                  label: '交付方式',
                  children: candidate.definition.delivery.kind,
                },
                {
                  key: 'images',
                  label: '镜像仓库',
                  children: candidate.definition.images.map((v) => v.repository).join('、'),
                },
                {
                  key: 'change',
                  label: '配置变化',
                  children:
                    JSON.stringify(candidate.definition) === JSON.stringify(source.data?.definition)
                      ? '定义内容一致，仅更新来源提交'
                      : '检测到交付定义变化，将保存为后续构建的候选配置',
                },
              ]}
            />
            <Alert
              title="保存只更新源码关联与候选交付定义，不覆盖销售设置、已发布版本或运行实例。"
              type="info"
              style={{ marginBottom: 16 }}
            />
            <Button type="primary" loading={save.isPending} onClick={() => save.mutate()}>
              保存新交付定义
            </Button>
          </>
        )}
      </Drawer>
      <Modal
        title="构建新版本"
        open={buildOpen}
        onCancel={() => setBuildOpen(false)}
        onOk={() => trigger.mutate()}
        confirmLoading={trigger.isPending}
        okText="提交构建"
        cancelText="取消"
        destroyOnHidden
      >
        <Alert
          title="CI 必须接收 stack_commit、stack_version、stack_build_id 输入，并按固定提交构建。构建结果仅登记版本草稿。"
          type="info"
          style={{ marginBottom: 16 }}
        />
        <Form form={buildForm} layout="vertical">
          <Form.Item
            name="version"
            label="版本号"
            rules={[
              { required: true },
              { pattern: /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/, message: '版本号格式不正确' },
            ]}
          >
            <Input placeholder="1.0.0" />
          </Form.Item>
        </Form>
      </Modal>
      <PublishingTokens code={code} open={tokensOpen} onClose={() => setTokensOpen(false)} />
    </>
  );
}
function PublishingTokens({
  code,
  open,
  onClose,
}: {
  code: string;
  open: boolean;
  onClose: () => void;
}) {
  const { message, modal } = App.useApp(),
    qc = useQueryClient(),
    [fresh, setFresh] = useState(''),
    [form] = Form.useForm();
  const query = useQuery({
    queryKey: ['publishing-tokens', code],
    queryFn: () => listPublishingTokens(code),
    enabled: open,
  });
  const issue = useMutation({
    mutationFn: async () => {
      const values = await form.validateFields();
      return issuePublishingToken(code, values.name);
    },
    onSuccess: (v) => {
      setFresh(v.token);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['publishing-tokens', code] });
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokePublishingToken(code, id),
    onSuccess: () => {
      setFresh('');
      void qc.invalidateQueries({ queryKey: ['publishing-tokens', code] });
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  return (
    <Drawer
      title="CI 发布凭证"
      open={open}
      onClose={() => {
        setFresh('');
        onClose();
      }}
      size="large"
      destroyOnHidden
    >
      <Alert
        title="凭证有效期 90 天，仅能为当前应用登记版本草稿。保存到应用仓库的 CI Secret：STACK_PUBLISH_TOKEN。"
        type="info"
        style={{ marginBottom: 16 }}
      />
      {fresh && (
        <Space.Compact block style={{ marginBottom: 16 }}>
          <Input.Password value={fresh} readOnly />
          <Button
            onClick={() => {
              void navigator.clipboard
                .writeText(fresh)
                .then(() => message.success('已复制'))
                .catch(() => message.error('复制失败，请手动复制'));
            }}
          >
            复制一次性凭证
          </Button>
        </Space.Compact>
      )}
      <AsyncState error={query.error} onRetry={() => void query.refetch()}>
        <Table
          rowKey="id"
          dataSource={query.data?.items}
          pagination={false}
          columns={[
            { title: '名称', dataIndex: 'name' },
            {
              title: '到期',
              dataIndex: 'expiresAt',
              render: (v: string) => new Date(v).toLocaleDateString(),
            },
            {
              title: '状态',
              render: (_, v) =>
                v.revoked ? '已撤销' : new Date(v.expiresAt) < new Date() ? '已过期' : '有效',
            },
            {
              title: '操作',
              render: (_, v) =>
                !v.revoked && (
                  <Button
                    type="link"
                    danger
                    onClick={() => {
                      modal.confirm({
                        title: '撤销发布凭证？',
                        okText: '撤销',
                        cancelText: '取消',
                        onOk: () => revoke.mutateAsync(v.id),
                      });
                    }}
                  >
                    撤销
                  </Button>
                ),
            },
          ]}
        />
      </AsyncState>
      <Form form={form} layout="vertical" style={{ marginTop: 24 }} onFinish={() => issue.mutate()}>
        <Form.Item name="name" label="凭证名称" rules={[{ required: true }]}>
          <Input placeholder="GitHub Actions" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={issue.isPending}>
          生成发布凭证
        </Button>
      </Form>
    </Drawer>
  );
}
