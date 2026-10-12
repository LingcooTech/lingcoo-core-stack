import { useState } from 'react';
import { Alert, App, Button, Form, Input, InputNumber, Modal, Space, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createHostingNodeSchema } from '@lingcoo/contracts';
import { apiClient } from '@/api/client';
export function AddHostingNode() {
  const qc = useQueryClient(),
    { message } = App.useApp(),
    [open, setOpen] = useState(false),
    [credential, setCredential] = useState<{ id: string; token: string } | null>(null),
    [visible, setVisible] = useState(false),
    [form] = Form.useForm<{
      name: string;
      serverIp: string;
      cpu: number;
      memory: number;
      disk: number;
    }>();
  const mutation = useMutation({
    mutationFn: async () => {
      const v = await form.validateFields();
      return apiClient('POST /v1/admin/hosting/nodes', '/v1/admin/hosting/nodes', {
        body: JSON.stringify(
          createHostingNodeSchema.parse({
            name: v.name.trim(),
            serverIp: v.serverIp.trim(),
            capacity: { cpuMillis: Math.round(v.cpu * 1000), memoryMb: v.memory, diskMb: v.disk },
          }),
        ),
      });
    },
    onSuccess: (r) => {
      setCredential({ id: r.node.id, token: r.reportToken });
      void qc.invalidateQueries({ queryKey: ['hosting-nodes'] });
      void message.success('节点已登记，默认暂停分配');
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>
        添加服务器
      </Button>
      <Modal
        title="添加服务器资源"
        open={open}
        width={720}
        maskClosable={false}
        closable={!credential && !mutation.isPending}
        onCancel={() => setOpen(false)}
        footer={
          credential ? (
            <Button
              type="primary"
              onClick={() => {
                setCredential(null);
                setVisible(false);
                form.resetFields();
                setOpen(false);
              }}
            >
              已保存，隐藏凭据
            </Button>
          ) : (
            <Space>
              <Button disabled={mutation.isPending} onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button type="primary" loading={mutation.isPending} onClick={() => mutation.mutate()}>
                登记服务器
              </Button>
            </Space>
          )
        }
      >
        <p>
          填写扣除系统与现有应用后的可分配预算。每个节点只登记一次；接入执行器并启用分配后，平台可以自动部署。
        </p>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ name: '', serverIp: '', cpu: 2, memory: 1024, disk: 20480 }}
          disabled={Boolean(credential) || mutation.isPending}
        >
          <div className="admin-form-grid">
            <Form.Item name="name" label="节点名称" rules={[{ required: true, whitespace: true }]}>
              <Input />
            </Form.Item>
            <Form.Item
              name="serverIp"
              label="服务器 IP"
              rules={[{ required: true, whitespace: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="cpu" label="可分配 CPU 核数" rules={[{ required: true }]}>
              <InputNumber min={0.1} step={0.1} />
            </Form.Item>
            <Form.Item name="memory" label="可分配内存 MiB" rules={[{ required: true }]}>
              <InputNumber min={128} precision={0} />
            </Form.Item>
            <Form.Item name="disk" label="可分配磁盘 MiB" rules={[{ required: true }]}>
              <InputNumber min={1024} precision={0} />
            </Form.Item>
          </div>
        </Form>
        {credential && (
          <Alert
            type="warning"
            showIcon
            title="服务器接入凭据仅显示一次"
            description={
              <Space orientation="vertical">
                <span>
                  下载接入配置，传入服务器接入命令。首次上报后显示资源状态；启用托管前还需完成网关、证书和备份验收。
                </span>
                <Typography.Text code>节点 ID：{credential.id}</Typography.Text>
                <Typography.Text code>
                  {visible ? credential.token : '••••••••••••••••'}
                </Typography.Text>
                <Space>
                  <Button
                    onClick={() => {
                      const blob = new Blob(
                        [
                          JSON.stringify(
                            {
                              stackUrl: window.location.origin,
                              nodeId: credential.id,
                              reportToken: credential.token,
                            },
                            null,
                            2,
                          ),
                        ],
                        { type: 'application/json' },
                      );
                      const url = URL.createObjectURL(blob),
                        a = document.createElement('a');
                      a.href = url;
                      a.download = 'node-enrollment.json';
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    下载接入配置
                  </Button>
                  <Button onClick={() => setVisible((v) => !v)}>
                    {visible ? '隐藏凭据' : '显示凭据'}
                  </Button>
                  <Button
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(credential.token)
                        .then(() => message.success('凭据已复制'))
                        .catch(() => message.error('复制失败，请手动保存'));
                    }}
                  >
                    复制凭据
                  </Button>
                </Space>
              </Space>
            }
          />
        )}
      </Modal>
    </>
  );
}
