import { useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Input, Modal, Space, Table } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { AsyncState } from '@/components/admin/AsyncState';
import { ManagementDrawer } from '@/components/admin/ManagementDrawer';
import { StatusTag } from '@/components/admin/StatusTag';
import { AdminHostingServicePanel } from '@/components/admin/HostingServicePanel';
import { AdminHostingExitPanel } from '@/components/admin/HostingExitPanel';
import { HostingUpgradePanel } from './HostingUpgradePanel';
import { ResourceMeter } from './HostingVisuals';
import { useHostingOverview } from './useHostingOverview';
import { formatTime } from '@/lib/utils';
const states: Record<string, string> = {
  pending: '等待执行',
  running: '执行中',
  succeeded: '成功',
  failed: '失败',
};
const deploymentStates: Record<string, string> = {
  ready: '运行就绪',
  maintenance: '维护升级中',
  exit_requested: '退出待处理',
  stopping: '停服备份中',
  retained: '已停服·保留数据',
  terminated: '已结束·保留数据',
  waiting_capacity: '等待资源',
  pending_infrastructure: '准备环境',
  deploying: '部署中',
  runtime_ready: '验证入口',
  pending_tls: '配置证书',
  failed: '部署失败',
  cancelled: '已取消',
};
const kinds = {
  restart: '重启应用',
  backup: '备份',
  retire: '停服并保留数据',
  export: '制作加密交付包',
  reclaim: '回收实例资源',
  upgrade: '受控镜像升级',
};
export function HostingInstances({
  view = 'instances',
  nodeNames = {},
  deploymentId,
}: {
  view?: 'instances' | 'operations';
  nodeNames?: Record<string, string>;
  deploymentId?: string;
}) {
  const qc = useQueryClient(),
    { message } = App.useApp(),
    overview = useHostingOverview();
  const [search, setSearch] = useState(''),
    [selected, setSelected] = useState<string | null>(null),
    [confirmation, setConfirmation] = useState<{
      id: string;
      label: string;
      kind: 'restart' | 'backup';
      requestKey: string;
    } | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!confirmation) throw new Error('请选择运维操作');
      return apiClient(
        'POST /v1/admin/hosting/instances/:param/operations',
        `/v1/admin/hosting/instances/${confirmation.id}/operations`,
        { body: JSON.stringify({ kind: confirmation.kind, requestKey: confirmation.requestKey }) },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hosting-overview'] });
      setConfirmation(null);
      void message.success('运维任务已提交，等待节点执行');
    },
  });
  const instances = (overview.data?.instances ?? []).filter(
    (i) =>
      (!deploymentId || i.id === deploymentId) &&
      `${i.label} ${i.customerEmail} ${i.hostname ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const operations = (overview.data?.operations ?? []).filter(
    (o) =>
      (!deploymentId || o.deploymentId === deploymentId) &&
      `${overview.data?.instances.find((i) => i.id === o.deploymentId)?.label ?? o.deploymentId} ${states[o.state]}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const instance = overview.data?.instances.find((i) => i.id === selected);
  const task = overview.data?.operations.find(
    (o) => o.deploymentId === instance?.id && ['pending', 'running'].includes(o.state),
  );
  const unavailable =
    Boolean(task) || mutation.isPending || !instance?.telemetryFresh || instance.state !== 'ready';
  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <p>
        {view === 'instances'
          ? '管理平台托管的应用；客户自有服务器由客户自行运维。'
          : '查看最近 100 条任务的执行结果与时间。'}
      </p>
      <Input.Search
        aria-label={view === 'instances' ? '搜索托管实例' : '搜索运维记录'}
        placeholder="搜索实例、客户、域名或任务状态"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: 400 }}
      />
      <AsyncState
        loading={overview.isPending}
        error={overview.error}
        onRetry={() => void overview.refetch()}
      >
        <Card>
          {view === 'instances' ? (
            <Table
              rowKey="id"
              dataSource={instances}
              scroll={{ x: 1100 }}
              pagination={{ pageSize: 20, showSizeChanger: false }}
              columns={[
                {
                  title: '实例 / 客户',
                  render: (_, i) => (
                    <Space orientation="vertical" size={0}>
                      <Button type="link" onClick={() => setSelected(i.id)}>
                        {i.label}
                      </Button>
                      <span>
                        {i.customerEmail} · {i.appCode}
                      </span>
                    </Space>
                  ),
                },
                {
                  title: '状态',
                  render: (_, i) => {
                    const bad =
                      !['retained', 'terminated', 'stopping'].includes(i.state ?? '') &&
                      i.services.some((c) => c.state !== 'running' || c.health === 'unhealthy');
                    return (
                      <StatusTag
                        tone={
                          !i.telemetryFresh
                            ? 'neutral'
                            : bad || i.state === 'failed'
                              ? 'danger'
                              : i.state === 'ready'
                                ? 'ok'
                                : 'warn'
                        }
                        label={
                          !i.telemetryFresh
                            ? '报告已过期'
                            : bad
                              ? '服务异常'
                              : (deploymentStates[i.state ?? ''] ?? '待确认')
                        }
                      />
                    );
                  },
                },
                {
                  title: '应用入口',
                  render: (_, i) =>
                    i.hostname && ['ready', 'exit_requested'].includes(i.state ?? '') ? (
                      <a href={`https://${i.hostname}`} target="_blank" rel="noreferrer">
                        {i.hostname}
                      </a>
                    ) : (
                      (i.hostname ?? '等待分配访问地址')
                    ),
                },
                {
                  title: '服务器',
                  render: (_, i) => (i.nodeId ? (nodeNames[i.nodeId] ?? '已分配节点') : '等待分配'),
                },
                {
                  title: '内存 / 预算',
                  render: (_, i) =>
                    `${i.telemetryFresh ? i.services.reduce((s, c) => s + c.memoryMb, 0).toFixed(0) : '—'} / ${i.resources?.memoryMb ?? '—'} MiB`,
                },
                {
                  title: '操作',
                  render: (_, i) => <Button onClick={() => setSelected(i.id)}>管理实例</Button>,
                },
              ]}
            />
          ) : (
            <Table
              rowKey="id"
              dataSource={operations}
              scroll={{ x: 1000 }}
              pagination={{ pageSize: 20, showSizeChanger: false }}
              columns={[
                { title: '请求时间', dataIndex: 'createdAt', render: (v: string) => formatTime(v) },
                {
                  title: '实例',
                  render: (_, o) =>
                    overview.data?.instances.find((i) => i.id === o.deploymentId)?.label ??
                    o.deploymentId,
                },
                { title: '操作', dataIndex: 'kind', render: (v: keyof typeof kinds) => kinds[v] },
                {
                  title: '状态',
                  render: (_, o) => (
                    <StatusTag
                      tone={
                        o.state === 'succeeded' ? 'ok' : o.state === 'failed' ? 'danger' : 'warn'
                      }
                      label={states[o.state] ?? '待确认'}
                    />
                  ),
                },
                {
                  title: '结果',
                  render: (_, o) =>
                    o.result === 'upgrade_rolled_back'
                      ? '新版本未通过，已回退并验证旧版本'
                      : o.result === 'upgrade_rejected'
                        ? '预检拒绝，原版本保持运行'
                        : o.result === 'verified'
                          ? '节点验证通过'
                          : o.result === 'lease_expired'
                            ? '执行超时，请检查节点'
                            : o.result === 'execution_failed'
                              ? '执行失败，请检查节点'
                              : '等待节点回报',
                },
                {
                  title: '完成时间',
                  dataIndex: 'completedAt',
                  render: (v: string) => formatTime(v),
                },
              ]}
            />
          )}
        </Card>
      </AsyncState>
      <ManagementDrawer
        title={instance?.label ?? '托管实例'}
        open={Boolean(instance)}
        size="large"
        onClose={() => setSelected(null)}
      >
        {instance && (
          <Space orientation="vertical" size={20} style={{ width: '100%' }}>
            <Descriptions
              bordered
              column={1}
              items={[
                { key: 'customer', label: '客户', children: instance.customerEmail },
                { key: 'app', label: '应用', children: instance.appCode },
                { key: 'id', label: '实例编号', children: instance.id },
                {
                  key: 'node',
                  label: '服务器',
                  children: instance.nodeId
                    ? (nodeNames[instance.nodeId] ?? instance.nodeId)
                    : '等待分配',
                },
                { key: 'hostname', label: '入口', children: instance.hostname ?? '等待分配' },
                {
                  key: 'state',
                  label: '状态',
                  children: deploymentStates[instance.state ?? ''] ?? '待确认',
                },
              ]}
            />
            <ResourceMeter
              label="实例内存 / 预算"
              value={
                instance.telemetryFresh && instance.services.length
                  ? instance.services.reduce((s, c) => s + c.memoryMb, 0)
                  : null
              }
              total={instance.resources?.memoryMb ?? null}
            />
            <Space wrap>
              {instance.services.map((c) => (
                <StatusTag
                  key={c.name}
                  tone={
                    ['retained', 'terminated'].includes(instance.state ?? '')
                      ? 'neutral'
                      : c.state !== 'running' || c.health === 'unhealthy'
                        ? 'danger'
                        : c.health === 'starting'
                          ? 'warn'
                          : 'ok'
                  }
                  label={`${c.service} · ${c.state !== 'running' ? '已停止' : c.health === 'unhealthy' ? '异常' : c.health === 'starting' ? '启动中' : '运行中'}`}
                />
              ))}
            </Space>
            <Card title="数据保护">
              {['retained', 'terminated'].includes(instance.state ?? '') ? (
                <p>
                  已停服，冷备份与异机副本已验证。保留期限及交接证据见退出记录；不再要求每日运行备份。
                </p>
              ) : (
                <Space orientation="vertical">
                  {[
                    {
                      label: '本地备份',
                      status: instance.backup?.status,
                      time: instance.backup?.completedAt,
                    },
                    {
                      label: '异机加密副本',
                      status: instance.backup?.offsiteStatus,
                      time: instance.backup?.offsiteAt,
                    },
                  ].map((b) => {
                    const stale =
                      Boolean(b.time) && Date.now() - Date.parse(b.time!) > 36 * 3600000;
                    return (
                      <Space key={b.label}>
                        <strong>{b.label}</strong>
                        <StatusTag
                          tone={
                            b.status === 'failed'
                              ? 'danger'
                              : b.status === 'success' && !stale
                                ? 'ok'
                                : 'warn'
                          }
                          label={
                            b.status === 'failed'
                              ? '失败'
                              : stale
                                ? '已过期'
                                : b.status === 'success'
                                  ? '已完成'
                                  : b.status === 'pending'
                                    ? '待上传'
                                    : '未就绪'
                          }
                        />
                        <span>{b.time ? formatTime(b.time) : '暂无成功记录'}</span>
                      </Space>
                    );
                  })}
                </Space>
              )}
            </Card>
            <Space wrap>
              <Button
                disabled={unavailable}
                onClick={() =>
                  setConfirmation({
                    id: instance.id,
                    label: instance.label,
                    kind: 'restart',
                    requestKey: crypto.randomUUID(),
                  })
                }
              >
                重启应用
              </Button>
              <Button
                disabled={unavailable}
                onClick={() =>
                  setConfirmation({
                    id: instance.id,
                    label: instance.label,
                    kind: 'backup',
                    requestKey: crypto.randomUUID(),
                  })
                }
              >
                立即备份
              </Button>
              <span>
                {task
                  ? states[task.state]
                  : !instance.telemetryFresh
                    ? '等待节点恢复上报后可操作'
                    : '操作结果可在运维记录中追踪'}
              </span>
            </Space>
            <AdminHostingServicePanel deploymentId={instance.id} />
            <AdminHostingExitPanel deploymentId={instance.id} />
            <HostingUpgradePanel deploymentId={instance.id} />
          </Space>
        )}
      </ManagementDrawer>
      <Modal
        title={confirmation?.kind === 'restart' ? '重启应用' : '创建一致性备份'}
        open={Boolean(confirmation)}
        onCancel={() => {
          if (!mutation.isPending) setConfirmation(null);
        }}
        onOk={() => mutation.mutate()}
        confirmLoading={mutation.isPending}
        okText="确认执行"
        cancelText="取消"
        maskClosable={false}
      >
        <p>
          {confirmation?.label}：
          {confirmation?.kind === 'restart'
            ? '将重启应用服务，期间会短暂不可用，数据库继续运行。'
            : '将短暂停止应用写入，完成本地备份后上传已配置的异机加密仓库。'}
        </p>
        {mutation.isError && <Alert type="error" title={mutation.error.message} />}
      </Modal>
    </Space>
  );
}
