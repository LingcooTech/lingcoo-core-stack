import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App, Button, Card, Form, Input, Modal, Select, Table, type TableColumnsType } from 'antd';
import { z } from 'zod';
import { grantEntitlement, listEntitlements, revokeEntitlement } from '@/api/admin';
import { listAppsAdmin, listCatalogPlans } from '@/api/apps';
import type { HydratedEntitlement, PlanSummary } from '@/api/types';
import { PageContainer, FormActions } from '@/components/admin/PageContainer';
import { AsyncState } from '@/components/admin/AsyncState';
import { StatusTag, statusToTone } from '@/components/admin/StatusTag';
import { useTableState } from '@/hooks/useTableState';
import { entitlementSourceLabel, entitlementStatusLabel } from '@/lib/portal-labels';
import { formatAmount, formatTime } from '@/lib/utils';

const PAGE_SIZE = 20;

const grantSchema = z.object({
  userEmail: z.string().email('请输入有效邮箱'),
  planCode: z.string().min(1, '请选择套餐'),
  reason: z.string().optional(),
});
type GrantValues = z.infer<typeof grantSchema>;

function formatPlanInterval(interval: string | null | undefined) {
  if (interval === 'month') return '月付';
  if (interval === 'year') return '年付';
  if (interval === 'one_time') return '一次性';
  return interval || '未设置';
}

export function LicensesPage() {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const [entitlementToRevoke, setEntitlementToRevoke] = useState<HydratedEntitlement | null>(null);
  const { page, search, setPage, setSearch } = useTableState({ defaultPageSize: PAGE_SIZE });
  const deferredSearchQuery = useDeferredValue(search);
  const entitlementQuery = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: deferredSearchQuery.trim() || undefined,
    }),
    [deferredSearchQuery, page],
  );

  const entitlementsQuery = useQuery({
    queryKey: ['entitlements', entitlementQuery],
    queryFn: () => listEntitlements(entitlementQuery),
  });
  const { data: plansData, isLoading: isPlansLoading } = useQuery({
    queryKey: ['catalog-plans'],
    queryFn: listCatalogPlans,
  });
  const { data: appsData } = useQuery({
    queryKey: ['apps'],
    queryFn: listAppsAdmin,
  });
  const entitlements = entitlementsQuery.data?.items ?? [];
  const totalEntitlements = entitlementsQuery.data?.total ?? 0;
  const appsById = useMemo(
    () => new Map((appsData?.items ?? []).map((app) => [app.id, app])),
    [appsData?.items],
  );

  const planGroups = useMemo(() => {
    const grouped = new Map<string, { appName: string; appCode: string; plans: PlanSummary[] }>();
    const plans = [...(plansData?.items ?? [])].sort((a, b) => a.code.localeCompare(b.code));
    for (const plan of plans) {
      const app = plan.appId ? appsById.get(plan.appId) : null;
      const key = app?.id ?? 'unassigned';
      const existing = grouped.get(key);
      if (existing) {
        existing.plans.push(plan);
        continue;
      }
      grouped.set(key, {
        appName: app?.name ?? '未关联应用',
        appCode: app?.code ?? 'unassigned',
        plans: [plan],
      });
    }
    return [...grouped.values()].sort((a, b) => a.appName.localeCompare(b.appName));
  }, [appsById, plansData?.items]);

  const [grantForm] = Form.useForm<GrantValues>();
  const grantUserEmail = searchParams.get('grantUserEmail');

  useEffect(() => {
    if (!grantUserEmail) return;
    if (grantForm.getFieldValue('userEmail') === grantUserEmail) return;
    grantForm.setFieldValue('userEmail', grantUserEmail);
  }, [grantForm, grantUserEmail]);

  const selectedPlanCode = Form.useWatch('planCode', grantForm);
  const selectedPlan = useMemo(
    () => (plansData?.items ?? []).find((plan) => plan.code === selectedPlanCode) ?? null,
    [plansData?.items, selectedPlanCode],
  );
  const selectedPlanApp = selectedPlan?.appId ? appsById.get(selectedPlan.appId) : null;

  const grantMutation = useMutation({
    mutationFn: grantEntitlement,
    onSuccess: (result) => {
      if (result.granted) {
        void message.success(`授权已发放给 ${result.user.email}，套餐 ${result.plan.code}`);
      } else {
        void message.info(`未重复发放：${result.user.email} 已拥有该 one_time 权益`);
      }
      grantForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['entitlements'] });
    },
    onError: (err) => void message.error(err instanceof Error ? err.message : '授权失败'),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeEntitlement,
    onSuccess: (result) => {
      void message.success(`已撤销 ${result.revokedCount} 条授权`);
      setEntitlementToRevoke(null);
      void qc.invalidateQueries({ queryKey: ['entitlements'] });
    },
    onError: (err) => void message.error(err instanceof Error ? err.message : '撤销失败'),
  });

  const columns: TableColumnsType<HydratedEntitlement> = [
    {
      key: 'user',
      title: '用户',
      render: (_, row) => (
        <div>
          <p className="text-xs font-bold">{row.user?.email ?? row.userId}</p>
          {row.user?.displayName && (
            <p className="text-xs text-muted-foreground">{row.user.displayName}</p>
          )}
          <p className="max-w-[120px] truncate font-mono text-[10px] text-muted-foreground">
            {row.id}
          </p>
        </div>
      ),
    },
    {
      key: 'app',
      title: '应用/套餐',
      render: (_, row) => (
        <div>
          <p className="font-mono text-xs font-bold">{row.app?.code ?? row.appId}</p>
          {row.plan && <p className="text-xs text-muted-foreground">{row.plan.code}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (_, row) => (
        <div className="flex flex-col gap-1">
          <StatusTag tone={statusToTone(row.status)} label={entitlementStatusLabel(row.status)} />
          <span className="text-[10px] text-muted-foreground">
            {entitlementSourceLabel(row.sourceType)}
          </span>
        </div>
      ),
    },
    {
      key: 'source',
      title: '来源',
      render: (_, row) => (
        <div>
          {row.sourceOrder ? (
            <p className="font-mono text-xs">{row.sourceOrder.orderNo}</p>
          ) : (
            <p className="max-w-[120px] truncate font-mono text-xs text-muted-foreground">
              {row.sourceId ?? '—'}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            {entitlementSourceLabel(row.sourceType)}
          </p>
        </div>
      ),
    },
    {
      key: 'validity',
      title: '有效期',
      render: (_, row) => (
        <div>
          <p className="text-xs">{row.expiresAt ? formatTime(row.expiresAt) : '永不过期'}</p>
          {row.startsAt && (
            <p className="text-[10px] text-muted-foreground">从 {formatTime(row.startsAt)}</p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      render: (_, row) =>
        row.status === 'active' ? (
          <Button
            size="small"
            danger
            className="text-xs text-destructive hover:text-destructive"
            disabled={revokeMutation.isPending}
            onClick={() => setEntitlementToRevoke(row)}
          >
            撤销
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">已撤销</span>
        ),
    },
  ];

  return (
    <PageContainer title="授权管理" description="人工发放、查询或撤销应用授权。">
      <Card title="人工发放授权" style={{ marginBottom: 16 }}>
        <Form
          form={grantForm}
          layout="vertical"
          initialValues={{ userEmail: '', planCode: undefined, reason: '' }}
          disabled={grantMutation.isPending}
          onFinish={(values: GrantValues) => {
            const parsed = grantSchema.safeParse(values);
            if (parsed.success) grantMutation.mutate(parsed.data);
            else
              grantForm.setFields(
                parsed.error.issues.flatMap((issue) => {
                  const name = issue.path[0];
                  return name === 'userEmail' || name === 'planCode' || name === 'reason'
                    ? [{ name, errors: [issue.message] }]
                    : [];
                }),
              );
          }}
        >
          <div className="admin-form-grid">
            <Form.Item
              name="userEmail"
              label="用户邮箱"
              rules={[
                { required: true, message: '请输入用户邮箱' },
                { type: 'email', message: '请输入有效邮箱' },
              ]}
            >
              <Input type="email" placeholder="user@example.com" />
            </Form.Item>
            <Form.Item
              name="planCode"
              label="套餐"
              rules={[{ required: true, message: '请选择套餐' }]}
              extra={
                selectedPlan
                  ? `${selectedPlanApp ? selectedPlanApp.name + ' / ' : ''}${formatPlanInterval(selectedPlan.interval)}${typeof selectedPlan.priceAmount === 'number' ? ' / ' + formatAmount(selectedPlan.priceAmount, selectedPlan.currency ?? 'CNY') : ''}`
                  : '从已有套餐中选择，避免手输编号出错。'
              }
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={isPlansLoading}
                placeholder="选择套餐"
                options={planGroups.map((group) => ({
                  label: group.appName,
                  options: group.plans.map((plan) => ({
                    value: plan.code,
                    label: `${plan.name} (${plan.code})`,
                  })),
                }))}
              />
            </Form.Item>
          </div>
          <Form.Item name="reason" label="备注（可选）">
            <Input.TextArea rows={2} placeholder="发放原因…" />
          </Form.Item>
          <FormActions>
            <Button type="primary" htmlType="submit" loading={grantMutation.isPending}>
              发放授权
            </Button>
          </FormActions>
        </Form>
      </Card>
      <Card title={`授权明细 (${totalEntitlements})`}>
        <Input.Search
          aria-label="搜索授权"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          allowClear
          placeholder="搜索用户、应用、套餐、订单号…"
          style={{ width: 360, maxWidth: '100%', marginBottom: 16 }}
        />
        <AsyncState
          error={entitlementsQuery.error}
          onRetry={() => void entitlementsQuery.refetch()}
        >
          <Table
            columns={columns}
            dataSource={entitlements}
            rowKey="id"
            loading={entitlementsQuery.isLoading}
            scroll={{ x: 950 }}
            locale={{ emptyText: '暂无授权记录' }}
            pagination={{
              total: totalEntitlements,
              current: page,
              pageSize: PAGE_SIZE,
              showSizeChanger: false,
              onChange: setPage,
            }}
          />
        </AsyncState>
      </Card>
      <Modal
        open={!!entitlementToRevoke}
        title="确认撤销授权？"
        okText="撤销授权"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        confirmLoading={revokeMutation.isPending}
        onCancel={() => setEntitlementToRevoke(null)}
        onOk={() => {
          if (entitlementToRevoke && !revokeMutation.isPending)
            revokeMutation.mutate(entitlementToRevoke.id);
        }}
      >
        将撤销 {entitlementToRevoke?.user?.email ?? entitlementToRevoke?.userId} 的当前授权。
      </Modal>
    </PageContainer>
  );
}
