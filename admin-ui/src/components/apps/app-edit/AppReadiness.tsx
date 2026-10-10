import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Collapse, Space, Tag, Typography } from 'antd';
import { apiClient } from '@/api/client';
export function AppReadiness({ appCode }: { appCode?: string }) {
  const query = useQuery({
    queryKey: ['app-readiness', appCode],
    enabled: Boolean(appCode),
    queryFn: () =>
      apiClient(
        'GET /v1/admin/apps/:appCode/readiness',
        `/v1/admin/apps/${encodeURIComponent(appCode!)}/readiness`,
      ),
  });
  return (
    <Card
      size="small"
      title={
        <Space wrap>
          <span>发布前检查</span>
          {query.data && (
            <Tag color={query.data.configurationReady ? 'success' : 'warning'}>
              {query.data.configurationReady ? '配置检查通过' : '发布配置待补齐'}
            </Tag>
          )}
        </Space>
      }
      extra={
        appCode && (
          <Button loading={query.isFetching} onClick={() => void query.refetch()}>
            重新检查
          </Button>
        )
      }
    >
      {!appCode ? (
        <Typography.Text type="secondary">保存应用草稿后检查发布条件。</Typography.Text>
      ) : query.isPending ? (
        <Typography.Text type="secondary">正在检查…</Typography.Text>
      ) : query.isError ? (
        <Alert type="error" title="检查失败，请重试。" />
      ) : (
        <Collapse
          size="small"
          items={[
            {
              key: 'checks',
              label: '查看检查明细',
              children: (
                <Space orientation="vertical" size={16} style={{ display: 'flex' }}>
                  <Typography.Text type="secondary">
                    仅针对已保存的配置；实际部署和支付仍需在线验收。
                  </Typography.Text>
                  {query.data.checks.map((c) => (
                    <div key={c.code}>
                      <Space>
                        <strong>{c.title}</strong>
                        <Tag
                          color={
                            c.status === 'blocked'
                              ? 'error'
                              : c.status === 'passed'
                                ? 'success'
                                : 'default'
                          }
                        >
                          {c.status === 'passed'
                            ? '通过'
                            : c.status === 'blocked'
                              ? '需补齐'
                              : '待在线验收'}
                        </Tag>
                      </Space>
                      <Typography.Paragraph
                        type="secondary"
                        style={{ marginTop: 8, marginBottom: 0 }}
                      >
                        {c.detail}
                      </Typography.Paragraph>
                    </div>
                  ))}
                </Space>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}
