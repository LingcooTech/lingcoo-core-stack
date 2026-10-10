import { Alert, App, Button, Card, Form, Input, Table } from 'antd';
import { useHostingHandover } from '@/hooks/useHostingHandover';
import { formatTime } from '@/lib/utils';
import { AsyncState } from './AsyncState';
import { FormActions } from './PageContainer';
export function AdminHostingHandoverPanel({
  deploymentId,
  version,
  completed,
  canManage,
}: {
  deploymentId: string;
  version: number;
  completed: boolean;
  canManage: boolean;
}) {
  const { query, mutation, reclamation } = useHostingHandover(deploymentId, version, true);
  const { modal } = App.useApp();
  const [form] = Form.useForm<{ confirm: string }>();
  const confirm = (kind: 'prepare' | 'reclaim', title: string) => {
    const requestKey = crypto.randomUUID();
    void modal.confirm({
      title,
      content:
        kind === 'reclaim'
          ? '将删除此实例的本地容器、数据卷和部署目录；保留期、工单及交付包检查由服务端再次确认。'
          : '将制作加密交付包并传输到备份节点。',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: kind === 'reclaim' },
      onOk: () =>
        mutation.mutateAsync(
          kind === 'reclaim'
            ? { kind, requestKey, expectedVersion: version, confirmDeploymentId: deploymentId }
            : { kind, requestKey, expectedVersion: version },
        ),
    });
  };
  return (
    <Card size="small" title="加密数据交付与资源回收">
      <p className="mb-4 text-sm text-muted-foreground">
        交付包有效期 7 天；客户分别领取加密数据包和独立解密密钥。下载授权有效期 10
        分钟且仅可使用一次。
      </p>
      <AsyncState
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Table
          dataSource={query.data?.items ?? []}
          rowKey="id"
          pagination={false}
          scroll={{ x: 640 }}
          locale={{ emptyText: '尚未制作交付包' }}
          columns={[
            {
              title: '状态',
              key: 'state',
              render: (_, item) =>
                item.state === 'revoked'
                  ? '已撤销'
                  : Date.parse(item.expiresAt) <= Date.now()
                    ? '已过期'
                    : item.state === 'ready'
                      ? '可下载'
                      : '制作与传输中',
            },
            {
              title: '大小',
              key: 'size',
              render: (_, item) =>
                item.size ? `${(item.size / 1048576).toFixed(1)} MiB` : '等待节点',
            },
            {
              title: '有效至',
              dataIndex: 'expiresAt',
              render: (value: string) => formatTime(value),
            },
            {
              title: '校验',
              dataIndex: 'sha256',
              render: (value?: string | null) => (
                <span className="text-xs break-all">{value ?? '等待生成'}</span>
              ),
            },
            {
              title: '操作',
              key: 'actions',
              render: (_, item) =>
                canManage && item.state === 'ready' && Date.parse(item.expiresAt) > Date.now() ? (
                  <Button
                    size="small"
                    danger
                    disabled={mutation.isPending}
                    onClick={() => {
                      void modal.confirm({
                        title: '撤销此交付包？',
                        okText: '确认撤销',
                        cancelText: '取消',
                        okButtonProps: { danger: true },
                        onOk: () => mutation.mutateAsync({ kind: 'revoke', handoverId: item.id }),
                      });
                    }}
                  >
                    撤销交付包
                  </Button>
                ) : (
                  '—'
                ),
            },
          ]}
        />
        {canManage && !reclamation && (
          <FormActions>
            <Button
              loading={mutation.isPending}
              onClick={() => confirm('prepare', '制作加密交付包？')}
            >
              制作加密交付包
            </Button>
          </FormActions>
        )}
      </AsyncState>
      {reclamation ? (
        <Alert
          style={{ marginTop: 16 }}
          type="info"
          title={
            reclamation.state === 'completed'
              ? '本地实例资源已回收；异机备份按原政策保留。'
              : '资源回收处理中；节点确认前继续保留资源预算。'
          }
        />
      ) : (
        canManage &&
        completed && (
          <Form
            form={form}
            layout="vertical"
            onFinish={() => confirm('reclaim', '确认回收本地实例资源？')}
            style={{ marginTop: 16 }}
            disabled={mutation.isPending}
          >
            <Form.Item
              name="confirm"
              label="输入实例编号确认"
              extra={<span className="break-all">{deploymentId}</span>}
              rules={[
                { required: true },
                {
                  validator: (_, value: string) =>
                    value === deploymentId
                      ? Promise.resolve()
                      : Promise.reject(new Error('实例编号不匹配')),
                },
              ]}
            >
              <Input autoComplete="off" />
            </Form.Item>
            <Button danger htmlType="submit" loading={mutation.isPending}>
              确认回收本地资源
            </Button>
          </Form>
        )
      )}
      {mutation.error && (
        <Alert style={{ marginTop: 16 }} type="error" title={mutation.error.message} />
      )}
    </Card>
  );
}
