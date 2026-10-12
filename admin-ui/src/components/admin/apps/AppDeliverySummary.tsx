import { useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { AppWithDetails } from '@/api/types';
import { getDevelopmentProject, selectDeliveryVersion } from '@/api/development';
import { getDeliveryManifest } from '@/lib/app-delivery';
import { AsyncState } from '@/components/admin/AsyncState';
export function AppDeliverySummary({
  app,
  dirty = false,
}: {
  app?: AppWithDetails;
  dirty?: boolean;
}) {
  const qc = useQueryClient(),
    { message } = App.useApp(),
    [selected, setSelected] = useState<string>();
  const query = useQuery({
    queryKey: ['app-lifecycle', app?.code],
    queryFn: () => getDevelopmentProject(app!.code),
    enabled: !!app,
  });
  const meta = (app?.meta ?? {}) as Record<string, unknown>,
    current = typeof meta.deliveryReleaseId === 'string' ? meta.deliveryReleaseId : undefined;
  const release = query.data?.releases.find((r) => r.id === (selected ?? current));
  const definition = release?.definition ?? query.data?.definition;
  const legacy = getDeliveryManifest(app);
  const mutation = useMutation({
    mutationFn: () => selectDeliveryVersion(app!.code, selected!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['apps'] });
      void qc.invalidateQueries({ queryKey: ['app-readiness'] });
      void message.success('交付版本已选择');
    },
    onError: (e) => void message.error(e.message),
  });
  if (!app) return <Alert type="info" title="先创建开发项目并导入商品草稿，再选择交付版本。" />;
  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card
        title="交付版本"
        extra={
          <Link to={`/admin/development/projects/${app.code}/delivery-settings`}>
            <Button>平台交付预设</Button>
          </Link>
        }
      >
        {dirty && (
          <Alert
            type="info"
            title="先保存商品修改，再切换交付版本。"
            style={{ marginBottom: 12 }}
          />
        )}
        <AsyncState
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
        >
          <Space wrap>
            <Select
              aria-label="交付版本"
              placeholder="选择已发布版本"
              style={{ width: 320 }}
              value={selected ?? current}
              onChange={setSelected}
              options={query.data?.releases
                .filter((r) => r.status === 'published' || r.id === current)
                .map((r) => ({
                  value: r.id,
                  label: `${r.version} · ${r.status === 'published' ? '已发布' : '已撤回'}`,
                  disabled: r.status !== 'published',
                }))}
            />
            <Button
              loading={mutation.isPending}
              disabled={dirty || !selected || selected === current}
              onClick={() => mutation.mutate()}
            >
              设为交付版本
            </Button>
          </Space>
          {!current && (
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              {legacy
                ? '当前沿用历史交付清单；迁移到标准版本后再选择。'
                : '尚未选择交付版本；先完成开发项目的版本验证与发布。'}
            </Typography.Paragraph>
          )}
        </AsyncState>
      </Card>
      {definition ? (
        <>
          <Descriptions
            bordered
            column={2}
            items={[
              {
                key: 'mode',
                label: '交付方式',
                children: definition.delivery.kind === 'none' ? '免部署' : 'Docker Compose',
              },
              { key: 'version', label: '版本', children: release?.version },
              {
                key: 'license',
                label: '软件许可证',
                children: definition.app.license,
              },
              {
                key: 'acquisition',
                label: '获取方式',
                children: definition.app.acquisition === 'free' ? '免费' : '购买授权',
              },
            ]}
          />
          {definition.delivery.kind === 'compose' && (
            <>
              <Card title="运行规格与部署方式">
                <Typography.Paragraph>
                  {definition.delivery.modes
                    .map((m) => (m === 'managed' ? '平台托管' : '客户自有服务器'))
                    .join('、')}
                </Typography.Paragraph>
                <Typography.Text code>
                  {JSON.stringify(definition.delivery.resources)}
                </Typography.Text>
              </Card>
              <Card title="部署参数（只读）">
                <Table
                  rowKey="key"
                  pagination={false}
                  scroll={{ x: 700 }}
                  dataSource={[
                    ...definition.delivery.envFields,
                    ...definition.delivery.secretFields,
                  ]}
                  columns={[
                    { title: '参数', dataIndex: 'label' },
                    { title: 'Key', dataIndex: 'key' },
                    {
                      title: '填写方',
                      dataIndex: 'scope',
                      render: (v) => (v === 'preset' ? '平台预设' : '部署时填写'),
                    },
                    { title: '类型', dataIndex: 'type' },
                    { title: '必填', dataIndex: 'required', render: (v) => (v ? '是' : '否') },
                  ]}
                />
              </Card>
            </>
          )}
          <Collapse
            items={[
              {
                key: 'definition',
                label: '完整交付声明（只读）',
                children: (
                  <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {JSON.stringify(definition, null, 2)}
                  </pre>
                ),
              },
            ]}
          />
        </>
      ) : legacy ? (
        <Collapse
          items={[
            {
              key: 'legacy',
              label: '当前交付声明（只读）',
              children: (
                <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {JSON.stringify(legacy, null, 2)}
                </pre>
              ),
            },
          ]}
        />
      ) : null}
    </Space>
  );
}
