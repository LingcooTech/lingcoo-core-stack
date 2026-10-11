import { useState } from 'react';
import { Alert, Button, Descriptions, Drawer, Select, Space, Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { EndpointResponse } from '@lingcoo/contracts';
import { previewComposePlan } from '@/api/compose-plan';
import { AsyncState } from '@/components/admin/AsyncState';

export function AppComposePlan({
  code,
  releaseId,
  modes,
}: {
  code: string;
  releaseId: string;
  modes: ('managed' | 'self_hosted')[];
}) {
  const [instanceId, setInstanceId] = useState<string | null>(null),
    [mode, setMode] = useState<'managed' | 'self_hosted'>(
      modes.includes('managed') ? 'managed' : 'self_hosted',
    );
  const query = useQuery({
    queryKey: ['app-compose-plan', code, releaseId, instanceId, mode],
    enabled: Boolean(instanceId),
    queryFn: () => previewComposePlan(code, releaseId, instanceId!, mode),
  });
  const plan = query.data?.plan;
  type Plan = EndpointResponse<'POST /v1/admin/apps/:param/releases/:param/plan'>['plan'];
  const fields = plan
    ? [
        ...plan.fields.env.map((v) => ({
          key: v.key,
          label: v.label,
          required: v.required,
          kind: v.scope === 'preset' ? '平台预设' : '客户输入',
        })),
        ...plan.fields.secrets.map((v) => ({
          key: v.key,
          label: v.label,
          required: v.required,
          kind: '密钥',
        })),
        ...plan.fields.domains.map((v) => ({
          key: v.envKey,
          label: v.label,
          required: v.required,
          kind: '域名',
        })),
      ]
    : [];
  return (
    <>
      <Button type="link" onClick={() => setInstanceId(crypto.randomUUID())}>
        部署计划
      </Button>
      <Drawer
        title="部署计划预览"
        open={Boolean(instanceId)}
        size="large"
        onClose={() => setInstanceId(null)}
        destroyOnHidden
      >
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <Select
            aria-label="部署方式"
            value={mode}
            onChange={setMode}
            options={modes.map((value) => ({
              value,
              label: value === 'managed' ? '平台托管' : '客户自有服务器',
            }))}
            style={{ width: 220 }}
          />
          <AsyncState
            loading={query.isPending}
            error={query.error}
            onRetry={() => void query.refetch()}
          >
            {plan && (
              <Space orientation="vertical" size="large" style={{ width: '100%' }}>
                <Alert
                  type="info"
                  showIcon
                  title="只读预览，不创建实例或占用服务器资源。通用执行器验收完成前不能据此发布容器版本。"
                />
                <Descriptions
                  column={1}
                  items={[
                    { key: 'version', label: '交付版本', children: plan.version },
                    {
                      key: 'digest',
                      label: '版本摘要',
                      children: (
                        <span style={{ wordBreak: 'break-all' }}>{plan.releaseDigest}</span>
                      ),
                    },
                    { key: 'project', label: '隔离项目示例', children: plan.project },
                    {
                      key: 'resources',
                      label: '实例预算',
                      children: `${plan.resources.cpuMillis} mCPU / ${plan.resources.memoryMb} MiB / ${plan.resources.diskMb} MiB 磁盘预算`,
                    },
                    {
                      key: 'entry',
                      label: '应用入口',
                      children: `${plan.entrypoint.service}:${plan.entrypoint.port}${plan.entrypoint.healthPath}`,
                    },
                    {
                      key: 'volumes',
                      label: '持久化卷',
                      children: plan.volumes.join('、') || '无',
                    },
                  ]}
                />
                <Table<Plan['services'][number]>
                  rowKey="name"
                  pagination={false}
                  dataSource={plan.services}
                  scroll={{ x: 600 }}
                  columns={[
                    { title: '服务', dataIndex: 'name' },
                    { title: 'CPU (mCPU)', dataIndex: 'cpuMillis' },
                    { title: '内存 (MiB)', dataIndex: 'memoryMb' },
                    {
                      title: '固定镜像',
                      dataIndex: 'image',
                      render: (v: string) => <span style={{ wordBreak: 'break-all' }}>{v}</span>,
                    },
                  ]}
                />
                <Table
                  rowKey="key"
                  pagination={false}
                  dataSource={fields}
                  columns={[
                    { title: '配置项', dataIndex: 'label' },
                    { title: '变量', dataIndex: 'key' },
                    { title: '来源', dataIndex: 'kind' },
                    {
                      title: '必填',
                      dataIndex: 'required',
                      render: (v: boolean) => (v ? <Tag>必填</Tag> : '可选'),
                    },
                  ]}
                />
              </Space>
            )}
          </AsyncState>
        </Space>
      </Drawer>
    </>
  );
}
