import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Collapse, Space, Tag } from 'antd';
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
      title="发布前检查"
      extra={
        appCode && (
          <Button loading={query.isFetching} onClick={() => void query.refetch()}>
            重新检查
          </Button>
        )
      }
    >
      <p>先保存草稿并配置交付，再启用应用。检查结果仅针对已保存的配置。</p>
      {!appCode ? (
        <p>创建草稿后可查看检查结果。</p>
      ) : query.isPending ? (
        <p>正在检查…</p>
      ) : query.isError ? (
        <Alert type="error" title="检查失败，请重试。" />
      ) : (
        <>
          <Tag color={query.data.configurationReady ? 'success' : 'warning'}>
            {query.data.configurationReady ? '配置检查通过' : '发布配置待补齐'}
          </Tag>
          <p>配置通过后仍需完成镜像拉取、实际交付和真实支付等在线验收。</p>
          <Collapse
            items={[
              {
                key: 'checks',
                label: '查看检查明细',
                children: (
                  <Space orientation="vertical">
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
                        <p>{c.detail}</p>
                      </div>
                    ))}
                  </Space>
                ),
              },
            ]}
          />
        </>
      )}
    </Card>
  );
}
