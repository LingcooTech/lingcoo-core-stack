import { useState } from 'react';
import { Alert, Card, Select, Space, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient } from '@/api/client';
import { AsyncState } from '@/components/admin/AsyncState';
import { StatusTag } from '@/components/admin/StatusTag';
import { formatTime } from '@/lib/utils';
export function HostingIncidents() {
  const [state, setState] = useState('active'),
    [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['hosting-incidents', state, (page - 1) * 30],
    queryFn: () =>
      apiClient(
        'GET /v1/admin/hosting/incidents',
        `/v1/admin/hosting/incidents?state=${state}&limit=30&offset=${(page - 1) * 30}`,
      ),
    refetchInterval: 30000,
  });
  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <p>按登记实例核对服务、备份、节点和服务期限。报告缺失不代表运行正常。</p>
      <Select
        aria-label="告警状态"
        value={state}
        style={{ width: 220 }}
        options={[
          { value: 'active', label: '待处理' },
          { value: 'resolved', label: '已恢复或退出监测' },
        ]}
        onChange={(v) => {
          setState(v);
          setPage(1);
        }}
      />
      <AsyncState
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data && (
          <>
            <Alert
              type={
                !query.data.lastScanAt || Date.now() - Date.parse(query.data.lastScanAt) > 600000
                  ? 'warning'
                  : 'info'
              }
              title={
                query.data.lastScanAt
                  ? `最近扫描：${formatTime(query.data.lastScanAt)}；当前 ${query.data.activeCount} 项待处理`
                  : '尚未完成首次扫描，不能据此判断健康状态。'
              }
              description={
                query.data.lastScanAt && Date.now() - Date.parse(query.data.lastScanAt) > 600000
                  ? '监测已超过 10 分钟未更新，请检查平台 Worker。'
                  : undefined
              }
            />
            <Card>
              <Table
                rowKey="id"
                dataSource={query.data.items}
                scroll={{ x: 1100 }}
                pagination={{
                  current: page,
                  pageSize: 30,
                  total: query.data.total,
                  showSizeChanger: false,
                  onChange: setPage,
                }}
                expandable={{ expandedRowRender: (item) => <History id={item.id} /> }}
                columns={[
                  { title: '告警', dataIndex: 'title' },
                  {
                    title: '状态',
                    render: (_, i) => (
                      <StatusTag
                        tone={
                          i.state === 'resolved'
                            ? 'ok'
                            : i.severity === 'critical'
                              ? 'danger'
                              : 'warn'
                        }
                        label={
                          i.state === 'resolved'
                            ? i.resolution === 'retired'
                              ? '已退出监测'
                              : '已恢复'
                            : i.severity === 'critical'
                              ? '异常'
                              : '提醒'
                        }
                      />
                    ),
                  },
                  {
                    title: '资源',
                    render: (_, i) => (
                      <Space orientation="vertical" size={0}>
                        <span>
                          {i.scope === 'node' ? '节点' : '实例'} {i.resourceId}
                        </span>
                        {i.scope === 'service' && <small>仅提醒，不自动停服或删除</small>}
                      </Space>
                    ),
                  },
                  {
                    title: '首次发现',
                    dataIndex: 'firstDetectedAt',
                    render: (v: string) => formatTime(v),
                  },
                  {
                    title: '最近异常',
                    dataIndex: 'lastDetectedAt',
                    render: (v: string) => formatTime(v),
                  },
                  { title: '次数', dataIndex: 'occurrences' },
                  {
                    title: '状态变更',
                    dataIndex: 'resolvedAt',
                    render: (v: string) => formatTime(v),
                  },
                  {
                    title: '操作',
                    render: (_, i) => (
                      <Link
                        to={
                          i.scope === 'node'
                            ? '/admin/servers'
                            : `/admin/hosting?tab=instances&deploymentId=${i.resourceId}`
                        }
                      >
                        查看{i.scope === 'node' ? '服务器' : '实例'}
                      </Link>
                    ),
                  },
                ]}
              />
            </Card>
          </>
        )}
      </AsyncState>
    </Space>
  );
}
function History({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ['hosting-incident-history', id],
    queryFn: () =>
      apiClient(
        'GET /v1/admin/hosting/incidents/:incidentId/events',
        `/v1/admin/hosting/incidents/${id}/events`,
      ),
  });
  return (
    <AsyncState loading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={query.data?.items ?? []}
        columns={[
          {
            title: '最近 100 条状态变化',
            dataIndex: 'observedAt',
            render: (v: string) => formatTime(v),
          },
          {
            title: '事件',
            dataIndex: 'kind',
            render: (v: string) =>
              v === 'opened' ? '发现异常' : v === 'recovered' ? '确认恢复' : '资源已退出监测',
          },
        ]}
      />
    </AsyncState>
  );
}
