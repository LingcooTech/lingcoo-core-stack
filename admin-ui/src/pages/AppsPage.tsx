import { useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Select, Space, Table } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { archiveApp, listAppsAdmin, purgeAppConfiguration } from '@/api/apps';
import type { AppWithDetails } from '@/api/types';
import { MetricCard, MetricGrid } from '@/components/admin/MetricCard';
import { PageContainer } from '@/components/admin/PageContainer';
import { AsyncState } from '@/components/admin/AsyncState';
import { StatusTag } from '@/components/admin/StatusTag';
import {
  getActiveOffers,
  getPreferredOffer,
  formatOfferPriceLabel,
  getAppStatusLabel,
  getAppTypeLabel,
} from '@/lib/app-catalog-ui';
import { useTableState } from '@/hooks/useTableState';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';
function meta(a: AppWithDetails) {
  return a.meta ?? {};
}
function archived(a: AppWithDetails) {
  return Boolean(meta(a).archivedAt) || a.status === 'inactive';
}
export function AppsPage() {
  const qc = useQueryClient(),
    { message } = App.useApp(),
    { user } = useAuth();
  const writable = hasPermission(normalizeRole(user?.role), 'apps.manage');
  const { page, search, filters, setPage, setSearch, setFilter, clearFilters } = useTableState({
    defaultPageSize: 20,
    knownFilters: ['category', 'state'],
  });
  const query = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const apps = (query.data?.items ?? []).filter((a) => !meta(a).deletedAt);
  const items = apps.filter(
    (a) =>
      (!search.trim() ||
        [a.name, a.code, a.tagline]
          .join(' ')
          .toLowerCase()
          .includes(search.trim().toLowerCase())) &&
      (!filters.category?.length || filters.category.includes(a.category ?? '')) &&
      (!filters.state?.[0] ||
        filters.state[0] === 'all' ||
        (filters.state[0] === 'archived' ? archived(a) : !archived(a) && a.status === 'active')),
  );
  const [action, setAction] = useState<{ app: AppWithDetails; kind: 'archive' | 'purge' } | null>(
      null,
    ),
    [form] = Form.useForm<{ confirmedCode: string }>();
  const mutation = useMutation({
    mutationFn: async () => {
      if (!action) throw new Error('请选择应用');
      if (action.kind === 'archive') return archiveApp(action.app.code);
      const { confirmedCode } = await form.validateFields();
      return purgeAppConfiguration(action.app.code, confirmedCode);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['apps'] });
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      setAction(null);
      form.resetFields();
      void message.success('应用配置已更新，经营历史已保留');
    },
    onError: (e) => {
      void message.error(e.message);
    },
  });
  return (
    <PageContainer
      title="应用管理"
      filters={
        <>
          <Input.Search
            aria-label="搜索应用"
            placeholder="搜索名称、Code、简介"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 300 }}
          />
          <Select
            mode="multiple"
            aria-label="分类"
            placeholder="全部分类"
            value={filters.category ?? []}
            options={[...new Set(apps.map((a) => a.category).filter(Boolean))].map((v) => ({
              label: v,
              value: v,
            }))}
            onChange={(v) => setFilter('category', v)}
            style={{ minWidth: 160 }}
          />
          <Select
            aria-label="应用状态"
            value={filters.state?.[0] ?? 'all'}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'active', label: '已发布' },
              { value: 'archived', label: '已归档' },
            ]}
            onChange={(v) => setFilter('state', [v])}
            style={{ width: 140 }}
          />
          <Button onClick={clearFilters}>重置</Button>
        </>
      }
      actions={
        writable && (
          <Button type="primary">
            <Link to="/admin/apps/new">新建应用</Link>
          </Button>
        )
      }
    >
      <MetricGrid>
        <MetricCard title="应用总数" value={apps.length} />
        <MetricCard
          title="已发布"
          value={apps.filter((a) => !archived(a) && a.status === 'active').length}
        />
        <MetricCard title="已归档" value={apps.filter(archived).length} />
        <MetricCard
          title="有在售套餐的应用"
          value={apps.filter((a) => getActiveOffers(a.checkoutOffers ?? []).length > 0).length}
        />
      </MetricGrid>
      <AsyncState error={query.error} onRetry={() => void query.refetch()}>
        <Card>
          <Table<AppWithDetails>
            rowKey="id"
            loading={query.isPending}
            dataSource={items}
            scroll={{ x: 1100 }}
            pagination={{
              current: page,
              pageSize: 20,
              showSizeChanger: false,
              onChange: setPage,
              showTotal: (t) => `共 ${t} 个应用`,
            }}
            columns={[
              {
                title: '应用',
                width: 300,
                render: (_, a) => (
                  <Space orientation="vertical" size={0}>
                    <Link to={`/admin/apps/${a.code}/edit`}>{a.name}</Link>
                    <small>{a.code}</small>
                    <span>{a.tagline}</span>
                  </Space>
                ),
              },
              { title: '分类', dataIndex: 'category' },
              { title: '类型', dataIndex: 'type', render: (v: string) => getAppTypeLabel(v) },
              {
                title: '状态',
                render: (_, a) => (
                  <StatusTag
                    label={archived(a) ? '已归档' : getAppStatusLabel(a.status)}
                    tone={archived(a) ? 'warn' : a.status === 'active' ? 'ok' : 'neutral'}
                  />
                ),
              },
              {
                title: '功能 / 套餐',
                render: (_, a) => `${a.features?.length ?? 0} / ${a.plans?.length ?? 0}`,
              },
              {
                title: '售卖价格',
                render: (_, a) => {
                  const offer = getPreferredOffer(a.checkoutOffers ?? []);
                  return offer ? formatOfferPriceLabel(offer) : '未配置';
                },
              },
              {
                title: '操作',
                width: 280,
                render: (_, a) => (
                  <Space wrap>
                    <Link to={`/admin/apps/${a.code}/edit`}>{writable ? '编辑' : '查看'}</Link>
                    <a href={`/apps/${a.code}`} target="_blank" rel="noopener noreferrer">
                      预览
                    </a>
                    {writable && (
                      <>
                        <Button
                          size="small"
                          disabled={archived(a)}
                          onClick={() => setAction({ app: a, kind: 'archive' })}
                        >
                          归档
                        </Button>
                        <Button
                          size="small"
                          danger
                          onClick={() => {
                            form.resetFields();
                            setAction({ app: a, kind: 'purge' });
                          }}
                        >
                          清空配置
                        </Button>
                      </>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </AsyncState>
      <Modal
        title={action?.kind === 'purge' ? '清空应用配置？' : '停用并归档应用？'}
        open={Boolean(action)}
        onCancel={() => setAction(null)}
        onOk={() => mutation.mutate()}
        confirmLoading={mutation.isPending}
        okText="确认"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        maskClosable={false}
      >
        <p>订单、支付、授权和部署历史会保留。应用将停止售卖。</p>
        {action?.kind === 'purge' && (
          <Form form={form} layout="vertical">
            <Form.Item
              name="confirmedCode"
              label={`输入应用 Code「${action.app.code}」确认`}
              rules={[
                { required: true },
                {
                  validator: (_, v) =>
                    v === action.app.code
                      ? Promise.resolve()
                      : Promise.reject(new Error('应用 Code 不匹配')),
                },
              ]}
            >
              <Input autoComplete="off" />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </PageContainer>
  );
}
