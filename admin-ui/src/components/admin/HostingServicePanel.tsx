import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Select,
  Timeline,
} from 'antd';
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  hostingServiceCommandSchema,
  type HostingService,
  type HostingServiceCommand,
} from '@lingcoo/contracts';
import { apiClient } from '@/api/client';
import { useHostingService } from '@/hooks/useHostingService';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';
import { formatTime } from '@/lib/utils';
import { AsyncState } from './AsyncState';
import { FormActions } from './PageContainer';
import { StatusTag } from './StatusTag';
const stateLabels = {
  terminated: '已结束（保留原服务期限）',
  pending_delivery: '等待交付起算',
  active: '服务期内',
  grace: '宽限期内',
  expired: '服务期已到期',
};
export function AdminHostingServicePanel({ deploymentId }: { deploymentId: string }) {
  return (
    <Collapse
      items={[
        {
          key: 'service',
          label: '托管服务期限',
          children: <Service deploymentId={deploymentId} />,
        },
      ]}
    />
  );
}
function Service({ deploymentId }: { deploymentId: string }) {
  const query = useHostingService(deploymentId, true);
  const { user } = useAuth();
  const service = query.data?.service;
  const canManage = hasPermission(normalizeRole(user?.role), 'hosting.terms.manage');
  return (
    <AsyncState loading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
      <div className="space-y-4">
        {service ? (
          <>
            <StatusTag
              tone={
                service.state === 'expired'
                  ? 'danger'
                  : service.state === 'grace'
                    ? 'warn'
                    : service.state === 'active'
                      ? 'ok'
                      : 'neutral'
              }
              label={stateLabels[service.state]}
            />
            <Descriptions
              size="small"
              bordered
              column={2}
              items={[
                {
                  key: 'source',
                  label: '服务来源',
                  children: { trial: '试用服务', manual: '人工授予', paid: '已支付托管' }[
                    service.source
                  ],
                },
                {
                  key: 'interval',
                  label: '周期',
                  children: service.interval === 'month' ? '月周期' : '年周期',
                },
                {
                  key: 'anchor',
                  label: '本轮服务起算',
                  children: service.anchorAt ? formatTime(service.anchorAt) : '成功交付后起算',
                },
                {
                  key: 'expires',
                  label: '服务到期',
                  children: service.expiresAt ? formatTime(service.expiresAt) : '尚未开始计时',
                },
                { key: 'grace', label: '宽限期', children: `${service.graceDays} 天` },
                {
                  key: 'retention',
                  label: '停服后数据保留',
                  children: `${service.retentionDays} 天`,
                },
                ...(service.graceEndsAt
                  ? [
                      {
                        key: 'graceEnds',
                        label: '宽限期结束',
                        children: formatTime(service.graceEndsAt),
                      },
                    ]
                  : []),
              ]}
            />
          </>
        ) : (
          <p>尚未登记托管服务期限。</p>
        )}
        <Alert
          type="info"
          title="服务期限与软件授权分别管理。到期状态不代表应用已停服；人工登记不产生付款记录。"
        />
        {canManage && service?.state !== 'terminated' && (
          <ServiceForm
            key={service?.version ?? 0}
            deploymentId={deploymentId}
            service={service ?? null}
          />
        )}
        {!!query.data?.changes.length && (
          <Collapse
            items={[
              {
                key: 'changes',
                label: `最近 ${query.data.changes.length} 条变更记录`,
                children: (
                  <Timeline
                    items={query.data.changes.map((change) => ({
                      content: (
                        <>
                          <p>
                            {change.kind === 'register'
                              ? '登记'
                              : change.kind === 'extend'
                                ? '人工延长'
                                : '交付起算'}{' '}
                            · 版本 {change.version} · {formatTime(change.createdAt)}
                          </p>
                          <p>{change.reason}</p>
                          <p>
                            到期时间：
                            {change.before?.expiresAt
                              ? formatTime(change.before.expiresAt)
                              : '未起算'}{' '}
                            →{' '}
                            {change.after.expiresAt
                              ? formatTime(change.after.expiresAt)
                              : '等待交付'}
                          </p>
                        </>
                      ),
                    }))}
                  />
                ),
              },
            ]}
          />
        )}
      </div>
    </AsyncState>
  );
}
type ServiceDraft = {
  source: 'trial' | 'manual';
  interval: 'month' | 'year';
  periods: number;
  graceDays: number;
  retentionDays: number;
  reason: string;
};
function ServiceForm({
  deploymentId,
  service,
}: {
  deploymentId: string;
  service: HostingService | null;
}) {
  const qc = useQueryClient();
  const { modal } = App.useApp();
  const [editing, setEditing] = useState(false);
  const [validation, setValidation] = useState('');
  const [form] = Form.useForm<ServiceDraft>();
  const pending = useRef<{ body: string; key: string } | null>(null);
  const mutation = useMutation({
    mutationFn: (body: HostingServiceCommand) =>
      apiClient(
        'POST /v1/admin/deployments/:deploymentId/hosting-service',
        `/v1/admin/deployments/${deploymentId}/hosting-service`,
        { body: JSON.stringify(body) },
      ),
    onSuccess: (result) => {
      qc.setQueryData(['hosting-service', true, deploymentId], result);
      void qc.invalidateQueries({ queryKey: ['hosting-service', false, deploymentId] });
      setEditing(false);
      form.resetFields();
    },
  });
  const submit = (values: ServiceDraft) => {
    const fields = {
      kind: service ? 'extend' : 'register',
      expectedVersion: service?.version ?? 0,
      periods: values.periods,
      reason: values.reason,
      ...(!service
        ? {
            source: values.source,
            interval: values.interval,
            graceDays: values.graceDays,
            retentionDays: values.retentionDays,
          }
        : {}),
    };
    const body = JSON.stringify(fields);
    if (pending.current?.body !== body) pending.current = { body, key: crypto.randomUUID() };
    const parsed = hostingServiceCommandSchema.safeParse({
      ...fields,
      requestKey: pending.current.key,
    });
    if (!parsed.success) {
      setValidation(parsed.error.issues[0]?.message ?? '请检查输入');
      return;
    }
    setValidation('');
    mutation.mutate(parsed.data);
  };
  if (!editing)
    return (
      <Button onClick={() => setEditing(true)}>
        {service ? '人工延长服务期' : '登记托管服务期'}
      </Button>
    );
  return (
    <Card size="small" title={service ? '人工延长服务期' : '登记托管服务期'}>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ source: 'trial', interval: 'month', periods: 1 }}
        onFinish={submit}
        disabled={mutation.isPending}
      >
        <p className="mb-4 text-sm text-muted-foreground">
          仅登记试用或人工授予的期限，不代表收款。未交付实例等待公网验证成功后起算。
        </p>
        <div className="admin-form-grid">
          {!service && (
            <>
              <Form.Item name="source" label="服务来源" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'trial', label: '试用' },
                    { value: 'manual', label: '人工授予' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="interval" label="周期" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'month', label: '月' },
                    { value: 'year', label: '年' },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="graceDays"
                label="宽限天数"
                rules={[{ required: true }, { type: 'integer', min: 0, max: 90 }]}
              >
                <InputNumber min={0} max={90} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="retentionDays"
                label="停服后保留天数"
                rules={[{ required: true }, { type: 'integer', min: 1, max: 3650 }]}
              >
                <InputNumber min={1} max={3650} style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="periods"
            label={service ? '增加周期数' : '服务周期数'}
            rules={[{ required: true }, { type: 'integer', min: 1, max: 120 }]}
          >
            <InputNumber min={1} max={120} style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <Form.Item
          name="reason"
          label="变更原因（仅后台可见）"
          rules={[
            { required: true, whitespace: true },
            {
              validator: (_, value: string) =>
                value?.trim().length >= 5 && value.trim().length <= 500
                  ? Promise.resolve()
                  : Promise.reject(new Error('原因须为 5–500 字')),
            },
          ]}
        >
          <Input.TextArea rows={3} maxLength={500} />
        </Form.Item>
        {(validation || mutation.error) && (
          <Alert
            type="error"
            title={validation || mutation.error?.message}
            action={
              <Button
                onClick={() =>
                  void qc.invalidateQueries({ queryKey: ['hosting-service', true, deploymentId] })
                }
              >
                刷新记录
              </Button>
            }
          />
        )}
        <FormActions>
          <Button
            onClick={() => {
              void (async () => {
                if (
                  !form.isFieldsTouched() ||
                  (await modal.confirm({
                    title: '放弃未保存的服务期限修改？',
                    okText: '放弃修改',
                    cancelText: '继续编辑',
                  }))
                )
                  setEditing(false);
              })();
            }}
            disabled={mutation.isPending}
          >
            取消
          </Button>
          <Button type="primary" htmlType="submit" loading={mutation.isPending}>
            {service ? '确认延长服务期' : '确认登记服务期'}
          </Button>
        </FormActions>
      </Form>
    </Card>
  );
}
