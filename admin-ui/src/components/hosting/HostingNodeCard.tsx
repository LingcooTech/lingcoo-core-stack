import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
} from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { hostingNodeStateSchema, type HostingNode } from '@lingcoo/contracts';
import { apiClient } from '@/api/client';
import { ManagementDrawer } from '@/components/admin/ManagementDrawer';
import { StatusTag } from '@/components/admin/StatusTag';
import { FormActions } from '@/components/admin/PageContainer';
import { useSettingsForm } from '@/lib/settings-form';
import { ResourceMeter } from './HostingVisuals';
import { formatTime } from '@/lib/utils';
export function HostingNodeCard({ node }: { node: HostingNode }) {
  const qc = useQueryClient(),
    { message } = App.useApp(),
    [modal, context] = Modal.useModal();
  const [details, setDetails] = useState(false),
    [editing, setEditing] = useState(false),
    [search, setSearch] = useState('');
  const change = useMutation({
    mutationFn: (payload: object) =>
      apiClient('PATCH /v1/admin/hosting/nodes/:param', `/v1/admin/hosting/nodes/${node.id}`, {
        body: JSON.stringify(hostingNodeStateSchema.parse(payload)),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hosting-nodes'] });
      void message.success('节点配置已保存');
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  const totals = node.telemetry?.totals,
    certificate = node.telemetry?.certificate,
    issuer = node.telemetry?.certificateAutomation,
    containers = node.telemetry?.containers ?? [];
  const alerts = node.alerts.map((a) => (
    <Alert key={a.code} type="warning" showIcon title={a.message} />
  ));
  return (
    <>
      {context}
      <Card
        title={node.name}
        extra={
          <StatusTag
            tone={node.healthy ? 'ok' : 'danger'}
            label={node.healthy ? '在线' : node.lastReportedAt ? '报告异常' : '待接入'}
          />
        }
      >
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <span>{node.serverIp}</span>
          <Space wrap>
            <StatusTag
              tone={node.telemetry?.canDeploy ? 'info' : 'neutral'}
              label={
                !node.telemetry ? '等待首次上报' : node.telemetry.canDeploy ? '托管节点' : '仅监控'
              }
            />
            <StatusTag
              tone={node.enabled ? 'ok' : 'neutral'}
              label={node.enabled ? '允许新分配' : '暂停新分配'}
            />
          </Space>
          <span>
            {[node.asset.provider, node.asset.region].filter(Boolean).join(' · ') ||
              '资产信息待完善'}
          </span>
          <span>
            执行协议：{node.telemetry?.supportedProtocols?.join('、') || '尚未上报通用协议'}
          </span>
          <span>兼容应用：{node.telemetry?.supportedApps?.join('、') || '尚无已验证适配器'}</span>
          <ResourceMeter
            label="内存使用"
            value={
              totals && node.available
                ? Math.max(0, totals.memoryMb - node.available.memoryMb)
                : null
            }
            total={totals?.memoryMb ?? null}
          />
          <ResourceMeter
            label="磁盘使用"
            value={
              totals && node.available
                ? Math.max(0, totals.diskMb - node.available.diskMb) / 1024
                : null
            }
            total={totals ? totals.diskMb / 1024 : null}
            unit="GiB"
          />
          <span>
            托管内存预留：{node.reserved.memoryMb} / {node.capacity.memoryMb} MiB
          </span>
          <span>
            证书：{certificate?.domain ?? (issuer ? '集中证书签发' : '尚未配置')} ·{' '}
            {issuer?.status === 'success' ? '签发与分发正常' : certificate ? '已加载' : '待检查'}
          </span>
          {alerts}
          <small>最近上报：{formatTime(node.lastReportedAt)}</small>
          <Space wrap>
            <Button onClick={() => setEditing(true)}>编辑资产与预算</Button>
            <Button onClick={() => setDetails(true)}>查看详情</Button>
          </Space>
        </Space>
      </Card>
      <ManagementDrawer
        title={node.name}
        description={`${node.serverIp} · 服务器详情`}
        open={details}
        onClose={() => setDetails(false)}
        size="large"
      >
        <Space orientation="vertical" size={20} style={{ width: '100%' }}>
          {alerts}
          <Descriptions
            title="资产与容量"
            bordered
            column={1}
            items={[
              { key: 'purpose', label: '用途', children: node.asset.purpose || '待填写' },
              {
                key: 'cost',
                label: '月成本',
                children:
                  node.asset.monthlyCostCents === null
                    ? '待填写'
                    : `¥${(node.asset.monthlyCostCents / 100).toFixed(2)}`,
              },
              { key: 'expires', label: '到期日期', children: formatTime(node.asset.expiresAt) },
              {
                key: 'cpu',
                label: 'CPU / 系统负载',
                children: `${totals ? totals.cpuMillis / 1000 : '—'} 核 / ${node.telemetry?.load1?.toFixed(2) ?? '—'}`,
              },
              {
                key: 'budget',
                label: '托管预算',
                children: `${node.capacity.cpuMillis / 1000} 核 / ${node.capacity.memoryMb} MiB / ${(node.capacity.diskMb / 1024).toFixed(1)} GiB`,
              },
              { key: 'notes', label: '备注', children: node.asset.notes || '—' },
            ]}
          />
          <Button
            disabled={change.isPending || (!node.enabled && node.telemetry?.canDeploy === false)}
            onClick={() => {
              modal.confirm({
                title: node.enabled ? '暂停新分配？' : '启用托管分配？',
                content: '暂停新分配不会影响已有实例与备份。',
                okText: '确认',
                cancelText: '取消',
                onOk: () => change.mutateAsync({ enabled: !node.enabled }),
              });
            }}
          >
            {node.enabled ? '暂停新分配' : '启用分配'}
          </Button>
          {node.telemetry?.canDeploy === false && (
            <Alert type="info" title="该节点仅监控，配置部署执行器后才能启用分配。" />
          )}
          <Descriptions
            title="证书管理"
            column={1}
            items={[
              {
                key: 'loaded',
                label: '网关证书',
                children: certificate
                  ? `${certificate.domain} · 到期 ${formatTime(certificate.expiresAt)}`
                  : issuer
                    ? '此节点集中签发，入口证书加载在托管网关。'
                    : '尚未加载',
              },
              {
                key: 'issuer',
                label: '签发与分发',
                children: issuer
                  ? `${issuer.status === 'success' ? '正常' : '失败'} · ${formatTime(issuer.checkedAt)}`
                  : '未配置',
              },
            ]}
          />
          <Card title={`容器资源清单（${containers.length}）`}>
            <p>既有非平台应用仅展示运行信息。</p>
            <Input.Search
              aria-label="搜索容器"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索容器、服务或项目"
            />
            <Table
              rowKey="name"
              size="small"
              scroll={{ x: 600 }}
              dataSource={containers.filter((c) =>
                `${c.name} ${c.project} ${c.service}`.toLowerCase().includes(search.toLowerCase()),
              )}
              pagination={{ pageSize: 20, showSizeChanger: false }}
              columns={[
                {
                  title: '容器 / 项目',
                  render: (_, c) => (
                    <>
                      <strong>{c.name}</strong>
                      <p>
                        {c.project || '独立容器'} · 重启 {c.restarts} 次
                      </p>
                    </>
                  ),
                },
                {
                  title: '状态',
                  render: (_, c) => (
                    <StatusTag
                      tone={
                        c.state !== 'running'
                          ? 'neutral'
                          : c.health === 'unhealthy'
                            ? 'danger'
                            : 'ok'
                      }
                      label={
                        c.state !== 'running'
                          ? '已停止'
                          : c.health === 'unhealthy'
                            ? '不健康'
                            : '运行中'
                      }
                    />
                  ),
                },
                { title: '内存', render: (_, c) => `${c.memoryMb.toFixed(1)} MiB` },
                { title: 'CPU', render: (_, c) => `${c.cpuPercent.toFixed(1)}%` },
              ]}
            />
          </Card>
        </Space>
      </ManagementDrawer>
      {editing && <NodeEditor node={node} onClose={() => setEditing(false)} />}
    </>
  );
}
function NodeEditor({ node, onClose }: { node: HostingNode; onClose: () => void }) {
  const qc = useQueryClient(),
    { message } = App.useApp(),
    [modal, context] = Modal.useModal();
  const { form, dirty, reset } = useSettingsForm({
    name: node.name,
    provider: node.asset.provider,
    region: node.asset.region,
    purpose: node.asset.purpose,
    notes: node.asset.notes,
    cost:
      node.asset.monthlyCostCents === null ? '' : (node.asset.monthlyCostCents / 100).toFixed(2),
    expires: node.asset.expiresAt
      ? new Date(node.asset.expiresAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
      : '',
    cpu: node.capacity.cpuMillis / 1000,
    memory: node.capacity.memoryMb,
    disk: node.capacity.diskMb,
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const v = await form.validateFields();
      return apiClient(
        'PATCH /v1/admin/hosting/nodes/:param',
        `/v1/admin/hosting/nodes/${node.id}`,
        {
          body: JSON.stringify(
            hostingNodeStateSchema.parse({
              name: v.name,
              capacity: { cpuMillis: Math.round(v.cpu * 1000), memoryMb: v.memory, diskMb: v.disk },
              asset: {
                provider: v.provider,
                region: v.region,
                purpose: v.purpose,
                notes: v.notes,
                monthlyCostCents: v.cost === '' ? null : Math.round(Number(v.cost) * 100),
                expiresAt: v.expires ? new Date(v.expires + 'T00:00:00+08:00').toISOString() : null,
              },
            }),
          ),
        },
      );
    },
    onSuccess: () => {
      reset(form.getFieldsValue(true));
      void qc.invalidateQueries({ queryKey: ['hosting-nodes'] });
      onClose();
      void message.success('节点配置已保存');
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  const close = () => {
    if (dirty)
      modal.confirm({
        title: '放弃节点配置修改？',
        okText: '放弃修改',
        cancelText: '继续编辑',
        onOk: onClose,
      });
    else onClose();
  };
  return (
    <ManagementDrawer
      title="编辑资产与预算"
      description={`${node.serverIp} · 预算是允许分配的上限，不是实际占用。`}
      open
      onClose={close}
      footer={
        <FormActions hint={dirty ? '有未保存的修改' : '已保存'}>
          <Button onClick={close}>取消</Button>
          <Button
            type="primary"
            loading={mutation.isPending}
            disabled={!dirty}
            onClick={() => mutation.mutate()}
          >
            保存节点配置
          </Button>
        </FormActions>
      }
    >
      {context}
      <Form form={form} name={`hosting-${node.id}`} layout="vertical" disabled={mutation.isPending}>
        <div className="admin-form-grid">
          {[
            ['name', '节点名称'],
            ['provider', '云厂商'],
            ['region', '地域'],
            ['purpose', '用途'],
            ['notes', '备注'],
          ].map(([key = '', label = '']) => (
            <Form.Item
              key={key}
              name={key}
              label={label}
              rules={key === 'name' ? [{ required: true, whitespace: true }] : []}
            >
              <Input />
            </Form.Item>
          ))}
          <Form.Item
            name="cost"
            label="月成本（元，可留空）"
            rules={[
              { pattern: /^(\d{1,7}(\.\d{1,2})?)?$/, message: '请输入非负金额，最多两位小数' },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="expires" label="到期日期">
            <Input type="date" />
          </Form.Item>
          <Form.Item
            name="cpu"
            label="托管 CPU 预算（核）"
            rules={[
              {
                required: true,
                type: 'number',
                min: Math.max(0.1, node.reserved.cpuMillis / 1000),
              },
            ]}
          >
            <InputNumber min={Math.max(0.1, node.reserved.cpuMillis / 1000)} step={0.1} />
          </Form.Item>
          <Form.Item
            name="memory"
            label="托管内存预算（MiB）"
            rules={[{ required: true, type: 'number', min: Math.max(128, node.reserved.memoryMb) }]}
          >
            <InputNumber min={Math.max(128, node.reserved.memoryMb)} precision={0} />
          </Form.Item>
          <Form.Item
            name="disk"
            label="托管磁盘预算（MiB）"
            rules={[{ required: true, type: 'number', min: Math.max(1024, node.reserved.diskMb) }]}
          >
            <InputNumber min={Math.max(1024, node.reserved.diskMb)} precision={0} />
          </Form.Item>
        </div>
      </Form>
    </ManagementDrawer>
  );
}
