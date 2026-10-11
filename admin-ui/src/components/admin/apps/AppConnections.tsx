import { useState } from 'react';
import { App, Button, Drawer, Form, Input, Select, Space, Table, Tag } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createAppConnection, deleteAppConnection, listAppConnections } from '@/api/app-lifecycle';
import { AsyncState } from '@/components/admin/AsyncState';

export function AppConnections() {
  const [open, setOpen] = useState(false),
    [form] = Form.useForm(),
    { message, modal } = App.useApp(),
    qc = useQueryClient();
  const query = useQuery({
    queryKey: ['app-connections'],
    queryFn: listAppConnections,
    enabled: open,
  });
  const kind = Form.useWatch('kind', form) ?? 'github';
  const save = useMutation({
    mutationFn: (input: unknown) => createAppConnection(input),
    onSuccess: () => {
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['app-connections'] });
      void message.success('连接已保存');
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  const remove = useMutation({
    mutationFn: deleteAppConnection,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['app-connections'] });
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  return (
    <>
      <Button onClick={() => setOpen(true)}>服务连接</Button>
      <Drawer
        title="Git 与镜像仓库连接"
        open={open}
        onClose={() => {
          setOpen(false);
          form.resetFields();
        }}
        size="large"
        destroyOnHidden
      >
        <AsyncState error={query.error} onRetry={() => void query.refetch()}>
          <Table
            rowKey="id"
            dataSource={query.data?.items}
            loading={query.isPending}
            pagination={false}
            columns={[
              { title: '名称', dataIndex: 'name' },
              {
                title: '类型',
                dataIndex: 'kind',
                render: (v: string) => <Tag>{v === 'github' ? 'GitHub' : '镜像仓库'}</Tag>,
              },
              { title: '地址', dataIndex: 'host' },
              {
                title: '操作',
                render: (_, row) => (
                  <Button
                    type="link"
                    danger
                    loading={remove.isPending}
                    onClick={() => {
                      modal.confirm({
                        title: '删除服务连接？',
                        content: '关联仓库的后续读取和镜像访问将需要重新配置连接。',
                        okText: '删除',
                        cancelText: '取消',
                        onOk: () => remove.mutateAsync(row.id),
                      });
                    }}
                  >
                    删除
                  </Button>
                ),
              },
            ]}
          />
        </AsyncState>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ kind: 'github' }}
          onFinish={(v: Record<string, unknown>) => save.mutate(v)}
          preserve={false}
          style={{ marginTop: 24 }}
        >
          <Form.Item name="kind" label="连接类型">
            <Select
              options={[
                { value: 'github', label: 'GitHub' },
                { value: 'registry', label: 'ACR / Docker Registry' },
              ]}
            />
          </Form.Item>
          <Form.Item name="name" label="连接名称" rules={[{ required: true }]}>
            <Input maxLength={120} />
          </Form.Item>
          {kind === 'github' ? (
            <Form.Item
              name="token"
              label="GitHub Token"
              extra="私有仓库读取需要 Contents: Read；触发构建需要 Actions: Write。公开仓库可以不配置连接。"
              rules={[{ required: true }]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          ) : (
            <>
              <Form.Item
                name="host"
                label="镜像仓库域名"
                extra="只填域名，不包含 https://、命名空间或镜像名称。"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
              <Form.Item name="username" label="只读拉取账号" rules={[{ required: true }]}>
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name="password" label="拉取密码" rules={[{ required: true }]}>
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </>
          )}
          <Space>
            <Button type="primary" htmlType="submit" loading={save.isPending}>
              添加连接
            </Button>
            <Button onClick={() => form.resetFields()}>重置</Button>
          </Space>
        </Form>
      </Drawer>
    </>
  );
}
