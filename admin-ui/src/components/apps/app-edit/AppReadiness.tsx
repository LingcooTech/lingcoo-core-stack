import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Collapse, Flex, Space, Tag, Typography } from 'antd';
import { apiClient } from '@/api/client';
import { ManagementDrawer } from '@/components/admin/ManagementDrawer';
import type { AppEditTabKey } from './model';

export function AppReadiness({
  appCode,
  dirty = false,
  onNavigate,
}: {
  appCode?: string;
  dirty?: boolean;
  onNavigate?: (tab: AppEditTabKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['app-readiness', appCode],
    enabled: Boolean(appCode),
    queryFn: () =>
      apiClient(
        'GET /v1/admin/apps/:appCode/readiness',
        `/v1/admin/apps/${encodeURIComponent(appCode!)}/readiness`,
      ),
  });
  const checks = query.data?.checks.filter((check) => check.blocking) ?? [];
  const passed = checks.filter((check) => check.status === 'passed').length;
  const live = query.data?.checks.filter((check) => !check.blocking) ?? [];
  return (
    <>
      <Space wrap size={8}>
        {dirty && appCode && <Tag>有未保存修改</Tag>}
        <Button size="small" disabled={!appCode} onClick={() => setOpen(true)}>
          {!appCode
            ? '保存后检查配置'
            : query.isError
              ? '配置检查失败'
              : query.isPending
                ? '检查配置中'
                : `配置检查 ${passed}/${checks.length}`}
        </Button>
      </Space>
      <ManagementDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="应用配置检查"
        size="small"
        description="检查已保存的售价、套餐权益和交付条件；通过后才可上架。"
      >
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          {dirty && (
            <Alert
              type="warning"
              showIcon
              title="当前有未保存修改，检查结果仍对应上次保存的配置。"
            />
          )}
          <Flex justify="space-between" align="center" gap={12}>
            <Tag color={query.data?.configurationReady ? 'success' : 'warning'}>
              已通过 {passed}/{checks.length}
            </Tag>
            <Button loading={query.isFetching} onClick={() => void query.refetch()}>
              重新检查
            </Button>
          </Flex>
          {query.isError && <Alert type="error" title="检查失败，请重试" />}
          {checks.map((check) => (
            <div key={check.code}>
              <Flex justify="space-between" align="center" gap={12}>
                <Space>
                  <Typography.Text strong>{check.title}</Typography.Text>
                  <Tag color={check.status === 'passed' ? 'success' : 'error'}>
                    {check.status === 'passed' ? '通过' : '待补齐'}
                  </Tag>
                </Space>
                {check.status !== 'passed' && onNavigate && (
                  <Button
                    size="small"
                    onClick={() => {
                      onNavigate(
                        check.code === 'offers'
                          ? 'offers'
                          : check.code === 'plans'
                            ? 'plans'
                            : 'delivery',
                      );
                      setOpen(false);
                    }}
                  >
                    去配置
                  </Button>
                )}
              </Flex>
              <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                {check.detail}
              </Typography.Paragraph>
            </div>
          ))}
          {!!live.length && (
            <Collapse
              items={[
                {
                  key: 'live',
                  label: '上线验收事项（不计入配置完成度）',
                  children: live.map((check) => (
                    <Typography.Paragraph key={check.code}>
                      <strong>{check.title}</strong>
                      <br />
                      {check.detail}
                    </Typography.Paragraph>
                  )),
                },
              ]}
            />
          )}
        </Space>
      </ManagementDrawer>
    </>
  );
}
