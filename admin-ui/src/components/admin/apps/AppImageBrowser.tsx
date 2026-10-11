import { useState } from 'react';
import { App, Alert, Button, Drawer, Form, Input, Select, Space, Table, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { listAppConnections } from '@/api/app-lifecycle';
import { listApplicationImageTags, resolveApplicationImage } from '@/api/app-images';
import { AsyncState } from '@/components/admin/AsyncState';
export function AppImageBrowser({
  code,
  imageKey,
  repository,
}: {
  code: string;
  imageKey: string;
  repository: string;
}) {
  const [open, setOpen] = useState(false),
    [connection, setConnection] = useState<string>(),
    [last, setLast] = useState<string>(),
    [reference, setReference] = useState(''),
    [resolved, setResolved] = useState(''),
    { message } = App.useApp();
  const connections = useQuery({
    queryKey: ['app-connections'],
    queryFn: listAppConnections,
    enabled: open,
  });
  const tags = useQuery({
    queryKey: ['app-image-tags', code, imageKey, connection, last],
    queryFn: () => listApplicationImageTags(code, imageKey, connection, last),
    enabled: open,
    retry: false,
  });
  const resolve = useMutation({
    mutationFn: (tag: string) => resolveApplicationImage(code, imageKey, tag, connection),
    onSuccess: (v) => {
      if (open && v.repository === repository) setResolved(v.image);
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  return (
    <>
      <Button type="link" onClick={() => setOpen(true)}>
        查看仓库版本
      </Button>
      <Drawer
        title="镜像仓库版本"
        size="large"
        open={open}
        onClose={() => {
          setOpen(false);
          setResolved('');
        }}
        destroyOnHidden
      >
        <Typography.Paragraph style={{ overflowWrap: 'anywhere' }}>
          {repository}
        </Typography.Paragraph>
        <Form layout="vertical">
          <Form.Item label="只读拉取连接">
            <Select
              value={connection}
              disabled={resolve.isPending}
              allowClear
              placeholder="公开镜像 / 匿名访问"
              onChange={(v) => {
                setConnection(v);
                setLast(undefined);
                setResolved('');
              }}
              options={connections.data?.items
                .filter(
                  (v) =>
                    v.kind === 'registry' && v.host === repository.split('/')[0]?.toLowerCase(),
                )
                .map((v) => ({ label: v.name, value: v.id }))}
            />
          </Form.Item>
          <Form.Item label="按标签或摘要核对">
            <Space.Compact block>
              <Input
                value={reference}
                placeholder="1.0.0 或 sha256:…"
                onChange={(e) => {
                  setReference(e.target.value);
                  setResolved('');
                }}
              />
              <Button
                onClick={() => resolve.mutate(reference)}
                disabled={!reference}
                loading={resolve.isPending}
              >
                核对摘要
              </Button>
            </Space.Compact>
          </Form.Item>
        </Form>
        {resolved && (
          <Alert
            type="success"
            style={{ marginBottom: 16 }}
            title="镜像 Manifest 摘要已核对"
            description={
              <Typography.Paragraph copyable style={{ overflowWrap: 'anywhere', margin: 0 }}>
                {resolved}
              </Typography.Paragraph>
            }
          />
        )}
        <AsyncState error={tags.error} onRetry={() => void tags.refetch()}>
          <Table
            rowKey="tag"
            loading={tags.isFetching}
            dataSource={tags.data?.tags.map((tag) => ({ tag }))}
            pagination={false}
            columns={[
              { title: '仓库标签', dataIndex: 'tag' },
              {
                title: '操作',
                render: (_, row) => (
                  <Button
                    type="link"
                    loading={resolve.isPending}
                    onClick={() => {
                      setReference(row.tag);
                      setResolved('');
                      resolve.mutate(row.tag);
                    }}
                  >
                    核对摘要
                  </Button>
                ),
              },
            ]}
          />
          <Space style={{ marginTop: 16 }}>
            {last && <Button onClick={() => setLast(undefined)}>返回第一页</Button>}
            {tags.data?.next && <Button onClick={() => setLast(tags.data!.next!)}>下一页</Button>}
          </Space>
        </AsyncState>
        <Alert
          type="info"
          style={{ marginTop: 16 }}
          title="仓库标签可变，交付版本使用固定摘要。这里只核对 Manifest，不代表已拉取全部镜像层或完成运行验收。"
        />
      </Drawer>
    </>
  );
}
