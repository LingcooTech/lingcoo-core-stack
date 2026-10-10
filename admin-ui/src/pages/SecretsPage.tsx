import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Table,
  Typography,
} from 'antd';
import { createAppSecret, listAppsAdmin, revokeAppSecret } from '@/api/apps';
import { PageContainer, FormActions } from '@/components/admin/PageContainer';
import { AsyncState } from '@/components/admin/AsyncState';
import { formatTime } from '@/lib/utils';
export function SecretsPage() {
  const qc = useQueryClient(),
    { message } = App.useApp(),
    [modal, context] = Modal.useModal();
  const [form] = Form.useForm<{ appCode: string; expiresAt: string }>();
  const [result, setResult] = useState<{
    secret: string;
    secretId: string;
    appCode: string;
  } | null>(null);
  const [visible, setVisible] = useState(false);
  const query = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const apps = query.data?.items ?? [];
  const create = useMutation({
    mutationFn: ({ appCode, expiresAt }: { appCode: string; expiresAt: string }) =>
      createAppSecret(appCode, expiresAt ? new Date(expiresAt).toISOString() : undefined),
    onSuccess: (saved) => {
      setVisible(false);
      setResult(saved);
      form.resetFields();
      void message.success('App Secret 已生成，请立即保存');
      void qc.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: (error) => {
      void message.error(error.message);
    },
  });
  const revoke = useMutation({
    mutationFn: ({ appCode, secretId }: { appCode: string; secretId: string }) =>
      revokeAppSecret(appCode, secretId),
    onSuccess: () => {
      void message.success('Secret 已撤销');
      void qc.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: (error) => {
      void message.error(error.message);
    },
  });
  return (
    <PageContainer title="应用密钥" description="生成和管理应用 API 密钥" width="form">
      {context}
      <AsyncState
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Card title="生成 App Secret">
          <Form
            name="app-secret"
            form={form}
            layout="vertical"
            initialValues={{ expiresAt: '' }}
            disabled={create.isPending}
            onFinish={(values) => create.mutate(values)}
          >
            <div className="admin-form-grid">
              <Form.Item
                name="appCode"
                label="选择应用"
                rules={[{ required: true, message: '请选择应用' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="选择应用"
                  options={apps.map((app) => ({
                    value: app.code,
                    label: `${app.name} (${app.code})`,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="expiresAt"
                label="过期时间（留空永不过期）"
                rules={[
                  {
                    validator: (_, value) =>
                      !value || Number.isFinite(new Date(value).getTime())
                        ? Promise.resolve()
                        : Promise.reject(new Error('请输入有效的过期时间')),
                  },
                ]}
              >
                <Input type="datetime-local" />
              </Form.Item>
            </div>
            <FormActions hint="生成后仅显示一次，请妥善保存">
              <Button type="primary" htmlType="submit" loading={create.isPending}>
                一键生成 Secret
              </Button>
            </FormActions>
          </Form>
        </Card>
        <Table
          style={{ marginTop: 24 }}
          rowKey="id"
          dataSource={apps.flatMap((app) =>
            (app.secrets ?? []).map((secret) => ({
              ...secret,
              appCode: app.code,
              appName: app.name,
            })),
          )}
          scroll={{ x: 650 }}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          columns={[
            {
              title: '应用',
              key: 'app',
              render: (_, row) => (
                <div>
                  {row.appName}
                  <br />
                  <Typography.Text type="secondary">{row.appCode}</Typography.Text>
                </div>
              ),
            },
            { title: '密钥提示', dataIndex: 'hint' },
            {
              title: '到期时间',
              key: 'expires',
              render: (_, row) => (row.expiresAt ? formatTime(row.expiresAt) : '永不过期'),
            },
            {
              title: '操作',
              key: 'actions',
              render: (_, row) => (
                <Button
                  danger
                  size="small"
                  disabled={revoke.isPending}
                  onClick={() => {
                    modal.confirm({
                      title: '确认撤销 Secret？',
                      content: `Secret ${row.hint} 撤销后将立即失效。`,
                      okText: '撤销 Secret',
                      cancelText: '取消',
                      okButtonProps: { danger: true },
                      onOk: () => revoke.mutateAsync({ appCode: row.appCode, secretId: row.id }),
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
      <Modal
        open={Boolean(result)}
        title="Secret 已生成"
        destroyOnHidden
        onCancel={() => {
          setResult(null);
          setVisible(false);
        }}
        footer={
          <Button
            type="primary"
            onClick={() => {
              setResult(null);
              setVisible(false);
            }}
          >
            我已保存，关闭
          </Button>
        }
      >
        <Alert
          type="warning"
          showIcon
          title="此 Secret 只显示一次，请立即复制保存。关闭后将无法再次查看。"
        />
        {result && (
          <>
            <Descriptions
              column={1}
              style={{ marginTop: 16 }}
              items={[
                { key: 'app', label: 'appCode', children: result.appCode },
                { key: 'id', label: 'secretId', children: result.secretId },
              ]}
            />
            <Flex gap={8} align="center">
              <Typography.Text code style={{ overflowWrap: 'anywhere', flex: 1 }}>
                {visible ? result.secret : '•'.repeat(40)}
              </Typography.Text>
              <Button
                aria-label={visible ? '隐藏密钥' : '显示密钥'}
                icon={
                  visible ? (
                    <EyeInvisibleOutlined aria-hidden="true" />
                  ) : (
                    <EyeOutlined aria-hidden="true" />
                  )
                }
                onClick={() => setVisible((value) => !value)}
              />
              <Button
                aria-label="复制密钥"
                icon={<CopyOutlined aria-hidden="true" />}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(result.secret)
                    .then(() => message.success('已复制到剪贴板'))
                    .catch(() => message.error('复制失败，请手动复制'));
                }}
              />
            </Flex>
          </>
        )}
      </Modal>
    </PageContainer>
  );
}
