import { useRef, useState } from 'react';
import { Alert, Button, Collapse, Descriptions, Form, Input, Select, Space, Table } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { AsyncState } from '@/components/admin/AsyncState';
import { useSettingsForm } from '@/lib/settings-form';
import { formatTime } from '@/lib/utils';
export function HostingUpgradePanel({ deploymentId }: { deploymentId: string }) {
  const qc = useQueryClient(),
    [open, setOpen] = useState(false);
  const { form, reset } = useSettingsForm({ releaseId: '', confirmation: '' });
  const releaseId = Form.useWatch('releaseId', form),
    confirmation = Form.useWatch('confirmation', form);
  const pending = useRef<{ releaseId: string; image: string; key: string } | null>(null);
  const path = `/v1/admin/deployments/${deploymentId}/upgrades`;
  const query = useQuery({
    queryKey: ['hosting-upgrade', deploymentId],
    queryFn: () => apiClient('GET /v1/admin/deployments/:deploymentId/upgrades', path),
    enabled: open,
    refetchInterval: open ? 15000 : false,
  });
  const selected = query.data?.releases.find((r) => r.id === releaseId);
  const mutation = useMutation({
    mutationFn: async () => {
      await form.validateFields();
      const image = query.data?.currentImage;
      if (!image || !selected || query.data?.blockedReason)
        throw new Error('升级条件已变化，请刷新检查');
      if (
        !pending.current ||
        pending.current.releaseId !== releaseId ||
        pending.current.image !== image
      )
        pending.current = { releaseId, image, key: crypto.randomUUID() };
      return apiClient('POST /v1/admin/deployments/:deploymentId/upgrades', path, {
        body: JSON.stringify({
          releaseId,
          expectedImage: image,
          requestKey: pending.current.key,
          confirmDeploymentId: confirmation,
        }),
      });
    },
    onSuccess: () => {
      pending.current = null;
      reset({ releaseId: '', confirmation: '' });
      void qc.invalidateQueries({ queryKey: ['hosting-upgrade', deploymentId] });
      void qc.invalidateQueries({ queryKey: ['hosting-overview'] });
    },
  });
  return (
    <Collapse
      onChange={(keys) => setOpen(keys.includes('upgrade'))}
      items={[
        {
          key: 'upgrade',
          label: '受控升级',
          children: (
            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
              <Alert
                type="warning"
                showIcon
                title="升级会短暂停服"
                description="先保存冷备份和异机副本，再验证新版本；失败时回退旧镜像。仅支持已审核、无需数据库迁移的版本。"
              />
              <AsyncState
                loading={query.isPending}
                error={query.error}
                onRetry={() => void query.refetch()}
              >
                {query.data && (
                  <>
                    <Descriptions
                      column={1}
                      items={[
                        {
                          key: 'image',
                          label: '当前镜像',
                          children: query.data.currentImage ?? '等待节点报告',
                        },
                      ]}
                    />
                    {query.data.blockedReason ? (
                      <Alert type="info" title={query.data.blockedReason} />
                    ) : (
                      <Form
                        form={form}
                        name={`upgrade-${deploymentId}`}
                        layout="vertical"
                        disabled={mutation.isPending}
                        onFinish={() => mutation.mutate()}
                      >
                        <Form.Item name="releaseId" label="目标版本" rules={[{ required: true }]}>
                          <Select
                            aria-label="目标升级版本"
                            options={query.data.releases.map((r) => ({
                              value: r.id,
                              label: r.label,
                            }))}
                          />
                        </Form.Item>
                        {selected && (
                          <>
                            <Descriptions
                              column={1}
                              items={[
                                { key: 'target', label: '目标镜像', children: selected.toImage },
                                {
                                  key: 'evidence',
                                  label: '审核依据',
                                  children: selected.reviewEvidence,
                                },
                              ]}
                            />
                            <Form.Item
                              name="confirmation"
                              label={`确认维护，请输入实例编号：${deploymentId}`}
                              rules={[
                                {
                                  validator: (_, v) =>
                                    v === deploymentId
                                      ? Promise.resolve()
                                      : Promise.reject(new Error('实例编号不匹配')),
                                },
                              ]}
                            >
                              <Input aria-label="升级确认实例编号" autoComplete="off" />
                            </Form.Item>
                            <Button
                              type="primary"
                              danger
                              htmlType="submit"
                              disabled={confirmation !== deploymentId || !query.data.currentImage}
                              loading={mutation.isPending}
                            >
                              确认停服备份并升级
                            </Button>
                          </>
                        )}
                      </Form>
                    )}
                    {mutation.isError && <Alert type="error" title={mutation.error.message} />}
                    <Table
                      rowKey="operationId"
                      size="small"
                      dataSource={query.data.history}
                      pagination={false}
                      scroll={{ x: 600 }}
                      columns={[
                        { title: '版本', render: (_, h) => h.plan.label },
                        {
                          title: '结果',
                          render: (_, h) =>
                            h.evidence?.outcome === 'upgraded'
                              ? '升级成功'
                              : h.evidence?.outcome === 'rolled_back'
                                ? '已回退旧版本'
                                : h.evidence?.outcome === 'rejected'
                                  ? '预检拒绝，原版本保持运行'
                                  : '维护中，等待节点验证',
                        },
                        {
                          title: '时间',
                          dataIndex: 'createdAt',
                          render: (v: string) => formatTime(v),
                        },
                        { title: '冷备份', render: (_, h) => h.evidence?.backup?.backupId ?? '—' },
                      ]}
                    />
                  </>
                )}
              </AsyncState>
            </Space>
          ),
        },
      ]}
    />
  );
}
