import { useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Select,
  Space,
  Tabs,
  Upload,
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  importApplication,
  listAppConnections,
  previewApplication,
  type ApplicationPreview,
} from '@/api/app-lifecycle';
import { AppConnections } from '@/components/admin/apps/AppConnections';
import { PageContainer } from '@/components/admin/PageContainer';

export function AppImportPage() {
  const [mode, setMode] = useState('repository'),
    [preview, setPreview] = useState<ApplicationPreview | null>(null),
    [form] = Form.useForm();
  const { message } = App.useApp(),
    navigate = useNavigate(),
    qc = useQueryClient();
  const connections = useQuery({ queryKey: ['app-connections'], queryFn: listAppConnections });
  const read = useMutation({
    mutationFn: async () => {
      const values = await form.validateFields();
      return previewApplication(
        mode === 'repository'
          ? {
              source: {
                repository: values.repository,
                ref: values.ref,
                path: values.path,
                ...(values.connectionId ? { connectionId: values.connectionId } : {}),
              },
            }
          : { document: values.document },
      );
    },
    onSuccess: setPreview,
    onError: (e) => {
      void message.error(e.message);
    },
  });
  const save = useMutation({
    mutationFn: () => importApplication(preview!),
    onSuccess: (v) => {
      void qc.invalidateQueries({ queryKey: ['apps'] });
      void message.success('应用草稿已创建');
      void navigate(`/admin/apps/${v.appCode}/lifecycle`);
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  return (
    <PageContainer
      title="导入应用"
      backTo="/admin/apps"
      actions={
        <Space>
          <Button href="/developers/standard" target="_blank" rel="noreferrer">
            开发接入文档
          </Button>
          <AppConnections />
        </Space>
      }
    >
      <Card>
        <Tabs
          activeKey={mode}
          onChange={(v) => {
            setMode(v);
            setPreview(null);
          }}
          items={[
            { key: 'repository', label: '从 Git 仓库导入' },
            { key: 'file', label: '上传交付定义' },
          ]}
        />
        <Form
          form={form}
          layout="vertical"
          initialValues={{ ref: 'main', path: 'stack/app.yaml' }}
          onValuesChange={() => setPreview(null)}
          onFinish={() => read.mutate()}
          disabled={read.isPending || save.isPending}
          preserve
        >
          {mode === 'repository' ? (
            <>
              <Form.Item
                name="repository"
                label="GitHub 仓库地址"
                rules={[
                  { required: true },
                  {
                    pattern: /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/,
                    message: '填写完整 GitHub 仓库地址',
                  },
                ]}
              >
                <Input placeholder="https://github.com/organization/application" />
              </Form.Item>
              <Form.Item
                name="connectionId"
                label="访问连接"
                extra="公开仓库可匿名读取；私有仓库选择已授权连接。"
              >
                <Select
                  allowClear
                  placeholder="公开仓库 / 匿名读取"
                  options={connections.data?.items
                    .filter((v) => v.kind === 'github')
                    .map((v) => ({ value: v.id, label: v.name }))}
                />
              </Form.Item>
              <Form.Item name="ref" label="分支、标签或提交" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="path" label="应用定义路径" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </>
          ) : (
            <>
              <Upload
                accept=".json,.yaml,.yml"
                showUploadList={false}
                beforeUpload={async (file) => {
                  if (file.size > 512000) {
                    void message.error('文件不能超过 500 KB');
                    return false;
                  }
                  form.setFieldValue('document', await file.text());
                  setPreview(null);
                  return false;
                }}
              >
                <Button icon={<UploadOutlined />}>选择 JSON / YAML 文件</Button>
              </Upload>
              <Form.Item
                name="document"
                label="应用定义"
                extra="文件上传需内嵌 Compose；从仓库读取可引用同一提交内的 Compose 文件。"
                rules={[{ required: true }]}
              >
                <Input.TextArea rows={14} spellCheck={false} />
              </Form.Item>
            </>
          )}
          <Button type="primary" htmlType="submit" loading={read.isPending}>
            读取并校验
          </Button>
        </Form>
      </Card>
      {preview && (
        <Card title="导入预览">
          <Descriptions
            column={{ xs: 1, md: 2 }}
            items={[
              { key: 'name', label: '应用', children: preview.definition.app.name },
              { key: 'code', label: 'App Code', children: preview.definition.app.code },
              {
                key: 'acquisition',
                label: '软件获取',
                children: preview.definition.app.acquisition === 'free' ? '免费领取' : '付费购买',
              },
              { key: 'license', label: '许可证', children: preview.definition.app.license },
              {
                key: 'delivery',
                label: '交付方式',
                children: preview.definition.delivery.kind === 'none' ? '免部署' : 'Docker Compose',
              },
              { key: 'images', label: '镜像组件', children: preview.definition.images.length },
              {
                key: 'commit',
                label: '源码提交',
                children: preview.source?.commit ?? '文件导入，未绑定仓库',
              },
              {
                key: 'features',
                label: '功能权益',
                children: preview.definition.features.map((v) => v.name).join('、') || '未声明',
              },
            ]}
          />
          {preview.warnings.map((v) => (
            <Alert key={v} title={v} type="info" showIcon style={{ marginBottom: 12 }} />
          ))}
          <Space>
            <Button type="primary" loading={save.isPending} onClick={() => save.mutate()}>
              创建应用草稿
            </Button>
            <Button onClick={() => setPreview(null)}>返回修改</Button>
          </Space>
        </Card>
      )}
    </PageContainer>
  );
}
